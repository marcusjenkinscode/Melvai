/** Lolcat-style rainbow ASCII art banner for the MELVAI terminal. */
export default function AsciiArt() {
  return (
    <div className="ascii-banner" aria-hidden="true">
      <pre className="ascii-art">
        {[
          '██╗   ██╗ ███████╗ ██╗      ██╗   ██╗  █████╗  ██╗',
          '████╗ ████║ ██╔════╝ ██║      ██║   ██║ ██╔══██╗ ██║',
          '██╔████╔██║ █████╗   ██║      ██║   ██║ ███████║ ██║',
          '██║╚██╔╝██║ ██╔══╝   ██║      ╚██╗ ██╔╝ ██╔══██║ ██║',
          '██║ ╚═╝ ██║ ███████╗ ███████╗  ╚████╔╝  ██║  ██║ ██║',
          '╚═╝     ╚═╝ ╚══════╝ ╚══════╝   ╚═══╝   ╚═╝  ╚═╝ ╚═╝',
        ].join('\n')}
      </pre>
      <div className="banner-meta">
        <span className="banner-version">v1.0</span>
        <span className="banner-sep"> · </span>
        <span className="banner-name">Melvin AI Terminal</span>
        <span className="banner-sep"> · </span>
        <span className="banner-powered">Powered by Ollama</span>
      </div>
      <div className="banner-rule" />
    </div>
  )
}
