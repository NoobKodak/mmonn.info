import { asset } from "../assets.js";
import { useAbout } from "../lib/content-store.jsx";
import HyperText from "./HyperText.jsx";
import "./AboutSection.css";

export default function AboutSection({ id }) {
  const { heading: ABOUT_HEADING, portrait: ABOUT_PORTRAIT, paragraphs: ABOUT_PARAGRAPHS } = useAbout();

  return (
    <section className="ab" id={id} aria-labelledby="about-title">
      <figure className="ab-figure">
        <img
          className="ab-portrait"
          src={asset(ABOUT_PORTRAIT.src)}
          alt={ABOUT_PORTRAIT.alt}
          width={ABOUT_PORTRAIT.width}
          height={ABOUT_PORTRAIT.height}
        />
      </figure>

      <div className="ab-body">
        {/* The heading is set art, so the accessible name comes from the alt. */}
        <h2 className="ab-heading" id="about-title">
          <img
            className="ab-heading-art"
            src={asset(ABOUT_HEADING.src)}
            alt={ABOUT_HEADING.alt}
            width={ABOUT_HEADING.width}
            height={ABOUT_HEADING.height}
          />
        </h2>

        <div className="ab-text">
          {ABOUT_PARAGRAPHS.map((paragraph, index) => (
            <HyperText
              className="ab-paragraph"
              key={paragraph.slice(0, 32)}
              as="p"
              duration={1100}
              delay={index * 140}
            >
              {paragraph}
            </HyperText>
          ))}
        </div>
      </div>
    </section>
  );
}
