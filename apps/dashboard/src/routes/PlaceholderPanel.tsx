export function PlaceholderPanel({
  title,
  description
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="placeholder">
      <div className="placeholder__eyebrow">Coming Next</div>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
