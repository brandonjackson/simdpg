import "./globals.css";

export const metadata = {
  title: "SimDPG Portal",
  description:
    "Simulated Digital Public Goods - Government services portal",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <header className="govuk-header">
          <div className="govuk-header__container">
            <div className="govuk-header__logo">
              <span className="govuk-header__logo-icon" aria-hidden="true">
                &#127963;
              </span>
              <a href="/" className="govuk-header__link">
                SimDPG
              </a>
            </div>
            <nav aria-label="Main navigation">
              <ul className="govuk-header__nav">
                <li>
                  <a href="/">Services</a>
                </li>
                <li>
                  <a href="/staff">Staff area</a>
                </li>
              </ul>
            </nav>
          </div>
        </header>

        <div className="govuk-phase-banner">
          <span className="govuk-phase-banner__tag">Alpha</span>
          <span className="govuk-phase-banner__text">
            This is a simulated government service for demonstration purposes.
          </span>
        </div>

        <div className="govuk-width-container">
          <main className="govuk-main-wrapper" id="main-content" role="main">
            {children}
          </main>
        </div>

        <footer className="govuk-footer">
          <div className="govuk-footer__container">
            <div className="govuk-footer__meta">
              <p>
                SimDPG is a simulated Digital Public Goods platform for
                development and testing purposes.
              </p>
              <p className="govuk-footer__licence">
                Built with Next.js. All data is fictional.
              </p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
