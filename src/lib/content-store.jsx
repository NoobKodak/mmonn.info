import { createContext, useContext, useEffect, useMemo, useState } from "react";

import bundledContent from "../data/content.json";
import { isSupabaseConfigured, supabase } from "./supabase.js";

/**
 * The site's content, live from Supabase.
 *
 * `bundledContent` — the JSON baked into the build — is the initial value, so
 * the page always has something to paint even if Supabase is unreachable or
 * misconfigured. Once the client can reach the `site_content` table it
 * replaces that value, and a Realtime subscription keeps it current after
 * that: an edit saved in the admin panel reaches every open tab of the public
 * site without a reload.
 */
const ContentContext = createContext(bundledContent);

export function ContentProvider({ children }) {
  const [content, setContent] = useState(bundledContent);

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;
    let cancelled = false;

    supabase
      .from("site_content")
      .select("content")
      .eq("id", "live")
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled || error || !data?.content) return;
        setContent(data.content);
      });

    const channel = supabase
      .channel("site_content_live")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "site_content", filter: "id=eq.live" },
        (payload) => {
          if (payload.new?.content) setContent(payload.new.content);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  return <ContentContext.Provider value={content}>{children}</ContentContext.Provider>;
}

function useContentValue() {
  return useContext(ContentContext);
}

/* ---------------------------------------------------------------------------
   Per-section accessors.

   Each one reproduces the exact shape the old `src/data/*.js` modules used to
   export as a static constant, computed live instead. Components that used to
   read a frozen import now read these; nothing about the rendered markup
   changes, only where the values come from.
   ------------------------------------------------------------------------ */

export function useRoles() {
  return useContentValue().hero.roles;
}

/** The number is derived from order, so reordering in the admin panel renumbers safely. */
export function useSections() {
  const { sections } = useContentValue();
  return useMemo(
    () => sections.map((section, index) => ({ ...section, number: String(index + 1).padStart(2, "0") })),
    [sections],
  );
}

/* Image geometry stays fixed here: the intrinsic dimensions govern layout, so
   swapping the artwork file is a design change, not a copy edit. */
export function useAbout() {
  const { about } = useContentValue();
  return useMemo(
    () => ({
      heading: { src: "about the4 artist.svg", alt: about.headingAlt, width: 680, height: 90 },
      portrait: { src: "aboutpage-hero-image.svg", alt: about.portraitAlt, width: 802, height: 1117 },
      paragraphs: about.paragraphs,
    }),
    [about],
  );
}

export function usePolaroid() {
  return useContentValue().polaroid;
}

/** An entry's own frame if it has one, otherwise the shared polaroid. */
export function frameFor(collaboration, polaroid) {
  return collaboration.frame?.src ? collaboration.frame : polaroid;
}

export function useCollaborations() {
  const { collaborations } = useContentValue();
  return useMemo(
    () => collaborations.map(({ photo, ...rest }) => (photo ? { ...rest, photo } : rest)),
    [collaborations],
  );
}

/** `{ label, slides }` — see StreamingMilestones.jsx for what `kind` and `tone` mean. */
export function useMilestones() {
  return useContentValue().milestones;
}

export function useMedia() {
  return useContentValue().media;
}

/** `{ headline: { before, circled, after }, items }` */
export function useProjects() {
  return useContentValue().projects;
}

export function useContactInfo() {
  const { contact } = useContentValue();
  return useMemo(
    () => ({
      instagram: {
        handle: contact.instagram,
        label: `IG: ${contact.instagram}`,
        url: `https://www.instagram.com/${contact.instagram}/`,
      },
      email: { address: contact.email, label: contact.email, url: `mailto:${contact.email}` },
      location: contact.location,
    }),
    [contact],
  );
}

export function useMusicMetrics() {
  return useContentValue().musicMetrics;
}
