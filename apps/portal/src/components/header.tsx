import { DeviceProfileControl } from "../device-profile-control";

export default function Header() {
  return (
    <header className="portal-header">
      <a className="portal-brand" href="/" aria-label="Feedbax home">
        <span aria-hidden="true">F</span>
        Feedbax
      </a>
      <nav aria-label="Public portal">
        <a href="/">Feedback</a>
        <a href="/roadmap">Roadmap</a>
        <a href="/changelog">Changelog</a>
        <a href="/submit">Create Post</a>
        <DeviceProfileControl />
      </nav>
    </header>
  );
}
