import { useMusicMetrics } from "../lib/content-store.jsx";

/** A concise audience snapshot, placed in the music catalog header. */
export default function MusicMetrics() {
  const musicMetrics = useMusicMetrics();

  return (
    <aside className="music-catalog-metrics" aria-label={musicMetrics.label}>
      <dl className="music-catalog-metrics-list">
        {musicMetrics.items.map((item) => (
          <div className="music-catalog-metrics-item" key={item.id}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
