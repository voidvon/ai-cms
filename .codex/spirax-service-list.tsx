import React from 'react';

export const scss = String.raw`.sg-service-page {
  background: #fff;
}

.sg-service-page img {
  max-width: 100%;
  height: auto;
}

.sg-service-page .page .wrapper .wrapper {
  width: 100%;
}

.sg-service-page .sg-service-page__split-column {
  min-width: 0;
  grid-column: span 6;
}

.sg-service-page .inline-image {
  padding: 44px 0;
}

.sg-service-page .inline-image__image {
  overflow: hidden;
  background: #fff;
}

.sg-service-page .inline-image__image img {
  display: block;
  width: 100%;
}

.sg-service-page .quote-block {
  display: grid;
  grid-template-columns: minmax(220px, 38%) 1fr;
  align-items: stretch;
  overflow: hidden;
  background: #fff;
}

.sg-service-page .quote-block__profile {
  min-height: 260px;
}

.sg-service-page .quote-block__img {
  width: 100%;
  height: 100%;
  min-height: 260px;
  background-repeat: no-repeat;
  background-position: center;
  background-size: cover;
}

.sg-service-page .quote-block__content {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 44px;
}

.sg-service-page .quote-block__quote {
  margin: 0;
  color: var(--sg-blue);
  font-size: clamp(26px, 4vw, 42px);
  font-weight: 600;
  line-height: 1.15;
}

.sg-service-page .sc-form form {
  display: grid;
  gap: 14px;
  padding: 28px;
  border: 1px solid var(--sg-border);
  background: #fff;
  box-shadow: 0 8px 22px rgba(0, 45, 114, 0.08);
}

.sg-service-page .sc-form label {
  color: var(--sg-blue);
  font-size: 14px;
  font-weight: 700;
}

.sg-service-page .sc-form input:not([type="checkbox"]):not([type="radio"]),
.sg-service-page .sc-form select,
.sg-service-page .sc-form textarea {
  width: 100%;
  min-height: 44px;
  padding: 10px 12px;
  border: 1px solid var(--sg-border);
  background: #fff;
  color: var(--sg-copy);
  font: inherit;
}

.sg-service-page .sc-form textarea {
  min-height: 140px;
}

.sg-service-page .sc-form input[type="submit"] {
  width: fit-content;
  min-width: 150px;
  border-color: var(--sg-color-primary);
  background: var(--sg-color-primary);
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}

@media (max-width: 720px) {
  .sg-service-page .sg-service-page__split-column {
    grid-column: span 12;
  }

  .sg-service-page .quote-block {
    grid-template-columns: 1fr;
  }

  .sg-service-page .quote-block__content {
    padding: 28px 20px;
  }
}

.sg-service-page .bg--notched-white,
.sg-service-page .clip-outside__wrap--small {
  position: relative;
}

.sg-service-page .bg--notched-white::before {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 40px;
  content: "";
  background: #fff;
}

.sg-service-page .clip-outside__wrap--small {
  padding-top: 58px;
}

.sg-service-page .clip-outside__wrap--small .section-header {
  padding-top: 0;
}

.sg-service-page .promo-bg {
  padding: 56px 0 70px;
  background:
    linear-gradient(rgba(0, 45, 114, 0.9), rgba(0, 45, 114, 0.9)),
    radial-gradient(
      circle at 20% 20%,
      rgba(255, 255, 255, 0.22),
      transparent 24%
    ),
    var(--sg-color-primary);
}

.sg-service-page .promo-banner {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 28px;
  align-items: center;
  padding: 34px 40px;
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
}

.sg-service-page .promo-banner__heading {
  margin: 0;
  color: #fff;
  font-size: clamp(28px, 3vw, 42px);
  font-weight: 600;
  line-height: 1.1;
}

.sg-service-page .promo-banner__copy p {
  max-width: 760px;
  margin: 14px 0 0;
  font-size: 17px;
  line-height: 1.7;
}

.sg-service-page .promo-banner__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: flex-end;
}

.sg-service-page .btn {
  display: inline-flex;
  min-height: 46px;
  align-items: center;
  justify-content: center;
  padding: 0 20px;
  font-weight: 700;
  text-decoration: none;
}

.sg-service-page .btn--primary {
  color: var(--sg-color-primary);
  background: #fff;
}

.sg-service-page .btn--secondary {
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.7);
}

@media (max-width: 1024px) {
  .sg-service-page .promo-banner {
    grid-template-columns: 1fr;
  }

  .sg-service-page .promo-banner__actions {
    justify-content: flex-start;
  }
}

@media (max-width: 720px) {
  .sg-service-page .clip-outside__wrap--small {
    padding-top: 38px;
  }

  .sg-service-page .promo-bg {
    padding: 38px 0;
  }

  .sg-service-page .promo-banner {
    padding: 24px;
  }
}
`;

export default function Template(props) {
  const shell = props.component('spirax_shell', props);
  const items = Array.isArray(props.items) ? props.items : [];
  const sectionLabel = props.sectionLabel || props.currentSection?.name || '服务';
  const masthead = props.component('spirax_short_masthead', {
    eyebrow: sectionLabel,
    title: props.title,
    summary: props.currentSection?.seoDescription || props.currentSection?.description || '',
    image: props.currentSection?.image || props.currentSectionHeroImage || '',
    imageAlt: props.title || sectionLabel,
    className: 'short-masthead'
  });
  const content = (
    <main className="sg-content-shell sg-news-page">
      {masthead}

      <section className="article-results-section bg--white">
        <div className="article-results__shell">
          <div className="article-results">
            <div className="article-results__top">
              <div className="article-results__info">
                <div className="article-results__count">{sectionLabel} (<span>{items.length}</span>)</div>
              </div>
            </div>
            <div className="article-results__container">
              <div className="article-results__list">
                {items.map((item, index) => (
                  <article className="article" key={item.url || item.title || index}>
                    {item.image ? (
                      <div className="article__image-wrap">
                        <a href={item.url || '#'}><img alt={item.title || ''} className="article__image" src={item.image} /></a>
                      </div>
                    ) : null}
                    <div className="article__content">
                      <div className="article__info">
                        {item.date ? <span className="article__posted">{item.date}</span> : null}
                      </div>
                      <div className="article__desc">
                        <div className="article__text">
                          <h2 className="article__title"><a href={item.url || '#'}>{item.title}</a></h2>
                          {item.summary ? <p className="article__summary">{item.summary}</p> : null}
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              {props.pagerHtml ? <div className="legacy-pager" dangerouslySetInnerHTML={{ __html: props.pagerHtml }} /> : null}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
  return shell ? React.cloneElement(shell, {}, content) : content;
}
