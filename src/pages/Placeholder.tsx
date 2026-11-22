export default function Placeholder({ title }: { title: string }) {
  return (
    <section className="placeholder">
      <h1>{title}</h1>
      <p className="muted">Coming next.</p>
    </section>
  );
}
