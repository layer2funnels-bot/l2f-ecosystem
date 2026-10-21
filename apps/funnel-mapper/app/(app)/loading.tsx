// Shown at once while a page of the app loads, so the menu and the way back from the editor answer on the first click.
export default function Loading() {
  return (
    <div className="mx-auto max-w-[1180px]" aria-busy="true" aria-label="Loading">
      <div className="fm-skel mb-2 h-3 w-28" />
      <div className="fm-skel mb-8 h-8 w-64" />
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((k) => (
          <div key={k} className="fm-skel h-16" />
        ))}
      </div>
      <div className="fm-skel mb-4 h-28" />
      <div className="fm-skel h-56" />
    </div>
  );
}
