import Link from 'next/link';

const apkUrl = '/downloads/brandspire-pos-0.4.0.apk';

export default function AndroidDownloadPage() {
  return <main className="shell android-download-shell">
    <div className="container">
      <header className="navbar">
        <Link className="brand-lockup" href="/">
          <span className="brand-mark">BP</span>
          <span className="brand-copy"><strong>Brandspire POS</strong><small>Android app</small></span>
        </Link>
        <Link className="btn" href="/auth/login">Web login</Link>
      </header>

      <section className="card android-download-card">
        <span className="android-download-badge">PUBLIC ANDROID PREVIEW</span>
        <div className="android-download-mark" aria-hidden="true">BP</div>
        <div>
          <h1>Brandspire POS for Android</h1>
          <p className="android-download-intro">Download the official Android app directly from Brandspire POS.</p>
        </div>
        <div className="android-download-meta"><span>Version 0.4.0</span><span>Android 8.0 or newer</span></div>
        <a className="btn btn-primary android-download-button" href={apkUrl} download>
          Download Android APK
        </a>
        <div className="android-install-instructions">
          <strong>Install the app</strong>
          <ol>
            <li>Download the APK to your Android phone.</li>
            <li>Open it and, if prompted, allow your browser to install this app.</li>
            <li>Tap Install. You can turn off that browser permission afterward.</li>
          </ol>
        </div>
        <p className="android-download-warning">
          Early access: test sign-in, billing, offline sync, and your printer model before relying on the app for live sales.
        </p>
      </section>
    </div>
  </main>;
}
