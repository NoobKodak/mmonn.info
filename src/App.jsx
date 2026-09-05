import AboutSection from "./components/AboutSection.jsx";
import ContactSection from "./components/ContactSection.jsx";
import Hero from "./components/Hero.jsx";
import HighlightsSection from "./components/HighlightsSection.jsx";
import MusicSection from "./components/MusicSection.jsx";
import NotableProjectsSection from "./components/NotableProjectsSection.jsx";
import ProfileSection from "./components/ProfileSection.jsx";
import { useSections } from "./lib/content-store.jsx";

/** Sections with a bespoke layout; everything else uses ProfileSection. */
const CUSTOM_SECTIONS = {
  about: AboutSection,
  highlights: HighlightsSection,
  music: MusicSection,
  "notable-projects": NotableProjectsSection,
  contact: ContactSection,
};

export default function App() {
  const SECTIONS = useSections();

  return (
    <div className="app">
      <a className="skip-link" href="#about">
        Skip to profile sections
      </a>

      <main>
        <Hero />

        {SECTIONS.map((section) => {
          const Section = CUSTOM_SECTIONS[section.id] ?? ProfileSection;
          return <Section key={section.id} {...section} />;
        })}
      </main>
    </div>
  );
}
