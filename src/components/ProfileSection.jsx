export default function ProfileSection({ id, number, label }) {
  const headingId = `${id}-title`;

  return (
    <section className="profile-section" id={id} aria-labelledby={headingId}>
      <p className="section-index">/ {number}</p>
      <h2 id={headingId}>{label}</h2>
    </section>
  );
}
