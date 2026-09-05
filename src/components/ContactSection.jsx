import { useContactInfo } from "../lib/content-store.jsx";
import "./ContactSection.css";

/** Supporting columns of micro type, mirroring the reference's mid-slab block. */
const NOTES = [
  ["REACH OUT", "FOR"],
  ["BOOKINGS, FEATURES", "AND PRESS ENQUIRIES"],
  ["MUSIC ARTIST, PRODUCER", "SONGWRITER, PERFORMER"],
];

export default function ContactSection({ id, number }) {
  const { instagram, email, location } = useContactInfo();
  const year = new Date().getFullYear();

  return (
    <section className="ct" id={id} aria-labelledby="contact-title">
      <div className="ct-slab">
        <div className="ct-head">
          {/* `display: contents` lets the two words sit in opposite corners of
              the 2x2 grid while the heading still reads "GET IN TOUCH". */}
          <h2 className="ct-title" id="contact-title">
            <span className="ct-title-a">GET IN</span>{" "}
            <span className="ct-title-b">TOUCH</span>
          </h2>
          <p className="ct-year">{year}</p>
          <p className="ct-index">({number})</p>
        </div>

        <div className="ct-notes">
          {NOTES.map(([first, second]) => (
            <p className="ct-note" key={first}>
              {first}
              <br />
              {second}
            </p>
          ))}
        </div>

        <div className="ct-primary">
          <p className="ct-primary-label">INSTAGRAM©</p>
          <a
            className="ct-primary-value"
            href={instagram.url}
            target="_blank"
            rel="noreferrer"
          >
            {instagram.handle.toUpperCase()}
          </a>
          <a className="ct-primary-email" href={email.url}>
            ({email.address.toUpperCase()})
          </a>
        </div>

        <p className="ct-credit">
          <span>ARTIST PROFILE©</span>
          <span>
            MMONN
            <br />
            {location.toUpperCase()}
          </span>
        </p>
      </div>
    </section>
  );
}
