import React from 'react';

export const scss = String.raw`.sg-news-page {
  --sg-news-industrial-blue-light: #3e6d89;
  --sg-content-shell-heading-margin-bottom: 34px;
  --sg-content-shell-heading-line-height: 1.08;
  --sg-content-shell-heading-accent-offset: 18px;
  color: var(--sg-copy);
  background: #fff;
}

.sg-news-page .wrapper--med {
  max-width: 1040px;
}

.sg-news-page .bg--industrial-blue-light {
  color: #fff;
  background: var(--sg-news-industrial-blue-light);
}

.sg-news-page .bg--light-blue-arrow {
  position: relative;
}

.sg-news-page .bg--light-blue-arrow::before {
  position: absolute;
  top: 0;
  left: 50%;
  width: 204px;
  height: 25px;
  margin-left: -102px;
  content: "";
  background:
    url("data:image/svg+xml;charset=utf-8,%3Csvg height='25' width='204' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M102 25L204 0H0z' fill='%23edf2f4'/%3E%3C/svg%3E")
    0 0 / cover no-repeat;
}

.sg-news-page .article-results-section {
  position: relative;
  background: #fff;
}

.sg-news-page .article-results-section::before {
  position: absolute;
  top: 0;
  left: 50%;
  width: 204px;
  height: 25px;
  margin-left: -102px;
  content: "";
  background:
    url("data:image/svg+xml;charset=utf-8,%3Csvg height='25' width='204' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M102 25L204 0H0z' fill='%23edf2f4'/%3E%3C/svg%3E")
    0 0 / cover no-repeat;
}

.sg-news-page .filters {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.sg-news-page .filters__shell {
  position: relative;
  width: min(900px, calc(100% - 40px));
  margin: 0 auto;
  padding-top: 42px;
  padding-bottom: 42px;
}

.sg-news-page .filters__header {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
}

.sg-news-page .filters__label {
  margin: 0;
  color: var(--sg-blue);
  font-size: 2rem;
  font-weight: 600;
  line-height: 1.2;
  text-align: left;
}

.sg-news-page .filters__chips,
.sg-news-page .filters__selected {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.sg-news-page .filters__chip,
.sg-news-page .filters__clear-btn {
  min-height: 40px;
  padding: 0 16px;
  border: 1px solid rgba(0, 45, 114, 0.14);
  border-radius: 999px;
  background: #fff;
  color: var(--sg-blue);
  font-size: 1.35rem;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  transition:
    border-color 150ms ease,
    background-color 150ms ease,
    color 150ms ease;
}

.sg-news-page .filters__selected-item {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid rgba(0, 45, 114, 0.16);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.9);
  color: var(--sg-blue);
  font-size: 1.2rem;
  font-weight: 600;
}

.sg-news-page .filters__chip:hover,
.sg-news-page .filters__chip:focus-visible,
.sg-news-page .filters__clear-btn:hover,
.sg-news-page .filters__clear-btn:focus-visible {
  border-color: rgba(0, 45, 114, 0.34);
  background: rgba(255, 255, 255, 0.7);
}

.sg-news-page .filters__chip--active {
  border-color: var(--sg-blue);
  background: var(--sg-blue);
  color: #fff;
}

.sg-news-page .text-link {
  color: var(--sg-blue);
  text-decoration: underline;
}

.sg-news-page .text-link:hover,
.sg-news-page .text-link:focus-visible {
  text-decoration: none;
}

.sg-news-page .article-results__shell {
  position: relative;
  width: min(1040px, calc(100% - 40px));
  margin: 0 auto;
  padding-top: 68px;
  padding-bottom: 68px;
}

.sg-news-page .article-results__top {
  margin-bottom: 28px;
}

.sg-news-page .article-results__info {
  display: block;
}

.sg-news-page .article-results__count {
  color: var(--sg-blue);
  font-size: 2rem;
  font-weight: 600;
  text-align: left;
}

.sg-news-page .article-results__container {
  padding: 0;
  border-top: 1px solid rgba(136, 181, 199, 0.5);
}

.sg-news-page .article-results__list {
  display: flex;
  flex-direction: column;
}

.sg-news-page .article {
  display: grid;
  grid-template-columns: minmax(220px, 300px) minmax(0, 1fr);
  gap: 32px;
  min-width: 0;
  padding: 32px 0;
  border-bottom: 1px solid rgba(136, 181, 199, 0.5);
  background: #fff;
  transition: box-shadow 200ms ease-in-out;
}

.sg-news-page .article:hover,
.sg-news-page .article:focus-within {
  box-shadow: none;
}

.sg-news-page .article__image-wrap {
  position: relative;
  height: 200px;
  overflow: hidden;
  border-radius: 14px;
  background-color: #f0f0f0;
}

.sg-news-page .article__image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.sg-news-page .article__content {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 200px;
  padding: 0;
  background: #fff;
}

.sg-news-page .article__info {
  width: 100%;
  margin-bottom: 14px;
}

.sg-news-page .article__desc {
  display: flex;
  flex: 1 1 auto;
  flex-flow: column nowrap;
  height: 100%;
  padding: 0;
}

.sg-news-page .article__text {
  flex: 1;
}

.sg-news-page .article__posted {
  color: #567587;
  font-size: 1.25rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.sg-news-page .article__title {
  margin: 0;
  color: var(--sg-blue);
  font-size: 2.4rem;
  font-weight: 600;
  line-height: 1.24;
}

.sg-news-page .article__title a {
  color: inherit;
  text-decoration: underline;
  text-decoration-thickness: 2px;
  text-underline-offset: 0.14em;
}

.sg-news-page .article__summary {
  margin: 14px 0 0;
  color: var(--sg-copy);
  font-size: 1.55rem;
  line-height: 1.72;
}

.sg-news-page .article-details {
  color: #fff;
  text-align: center;
}

.sg-news-page .article-details__shell {
  position: relative;
  width: min(var(--sg-content-shell-max-width), calc(100% - 40px));
  margin: 0 auto;
  padding-top: 54px;
  padding-bottom: 54px;
}

.sg-news-page .article-details__title {
  position: relative;
  margin: 0 auto 34px;
  color: #fff;
  font-weight: 600;
  line-height: 1.08;
  text-align: center;
  text-transform: none;
}

.sg-news-page .article-details__title::after {
  position: absolute;
  bottom: -18px;
  left: 50%;
  width: 90px;
  height: 5px;
  margin-left: -45px;
  content: "";
  background: rgba(255, 255, 255, 0.48);
}

.sg-news-page .article__footer {
  margin-top: auto;
}

.sg-news-page .article__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 18px;
}

.sg-news-page .article__tag {
  padding: 6px 10px;
  border-radius: 999px;
  background: #eef4f7;
  color: var(--sg-blue);
  font-size: 1.15rem;
  font-weight: 600;
  white-space: nowrap;
}

.sg-news-page .article-results__empty {
  padding: 54px 0;
}

.sg-news-page .article-results__empty-title {
  margin: 0;
  color: var(--sg-blue);
  font-size: 2.2rem;
  font-weight: 600;
}

.sg-news-page .article-results__empty-copy {
  max-width: 640px;
  margin: 14px 0 0;
  color: var(--sg-copy);
  font-size: 1.55rem;
  line-height: 1.72;
}

.sg-news-page .u-light {
  color: #fff;
}

.sg-news-page .u-align-center {
  text-align: center;
}

.sg-news-page .u-align-left {
  text-align: left;
}

.sg-news-page .u-nocase {
  text-transform: none;
}

.sg-news-page .article-intro__shell {
  position: relative;
  width: min(900px, calc(100% - 40px));
  margin: 0 auto;
  padding-top: 54px;
  padding-bottom: 54px;
}

.sg-news-page .article-intro {
  color: var(--sg-blue);
  text-align: center;
}

.sg-news-page .article-intro__copy {
  font-size: 21px;
  line-height: 1.72;
}

.sg-news-page .article-body__shell {
  position: relative;
  width: min(900px, calc(100% - 40px));
  margin: 0 auto;
  padding-top: 68px;
  padding-bottom: 68px;
}

.sg-news-page .article-body {
  text-align: center;
}

.sg-news-page .article-body__copy {
  font-size: 17px;
  line-height: 1.8;
  text-align: left;
}

.sg-news-page .article-intro__copy p,
.sg-news-page .article-body__copy p,
.sg-news-page .article-body__copy ul {
  margin: 0;
}

.sg-news-page .article-intro__copy p + p,
.sg-news-page .article-body__copy p + p,
.sg-news-page .article-body__copy p + ul,
.sg-news-page .article-body__copy ul + p,
.sg-news-page .article-body__copy ul + ul {
  margin-top: 18px;
}

.sg-news-page .article-body__copy ul {
  padding-left: 20px;
  list-style: disc;
}

.sg-news-page .article-body__copy li + li {
  margin-top: 8px;
}

.sg-news-page .inline-image__shell {
  width: min(900px, calc(100% - 40px));
  margin: 0 auto;
}

.sg-news-page .inline-image {
  padding-bottom: 54px;
}

.sg-news-page .inline-image__image img {
  display: block;
  width: 100%;
}

.sg-news-page .clip-outside__wrap--small .wrapper {
  padding-top: 54px;
  padding-bottom: 54px;
}

.sg-news-page .card {
  position: relative;
  display: flex;
  min-height: 218px;
  overflow: hidden;
  background: #fff;
  box-shadow: 0 8px 22px rgba(0, 45, 114, 0.1);
}

.sg-news-page .card--rounded {
  border-radius: 4px;
}

.sg-news-page .card--grey {
  background: #eef1f3;
}

.sg-news-page .card__img {
  flex: 0 0 42%;
  min-height: 218px;
  background-repeat: no-repeat;
  background-position: center;
  background-size: cover;
}

.sg-news-page .card__content {
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: center;
  padding: 26px 28px;
}

.sg-news-page .card__title {
  margin: 0;
  color: var(--sg-blue);
  font-size: 20px;
  font-weight: 700;
  line-height: 1.24;
}

.sg-news-page .card__title a {
  color: inherit;
  text-decoration: none;
}

.sg-news-page .card__title a::after {
  display: inline-block;
  margin-left: 8px;
  color: var(--sg-mid-blue);
  content: "›";
  transition: transform 160ms ease;
}

.sg-news-page .card:hover .card__title a::after,
.sg-news-page .card:focus-within .card__title a::after {
  transform: translateX(4px);
}

.sg-news-page .card__desc {
  margin-top: 14px;
  font-size: 15px;
  line-height: 1.68;
}

.sg-news-page .card__desc p {
  margin: 0;
  white-space: pre-line;
}

@media (max-width: 1024px) {
  .sg-news-page .article {
    grid-template-columns: minmax(200px, 260px) minmax(0, 1fr);
  }
}

@media (max-width: 720px) {
  .sg-news-page .clip-outside__wrap--small .wrapper {
    padding-top: 38px;
    padding-bottom: 38px;
  }

  .sg-news-page .bg--light-blue-arrow::before {
    width: 102px;
    height: 12px;
    margin-left: -51px;
  }

  .sg-news-page .article-results-section::before {
    width: 102px;
    height: 12px;
    margin-left: -51px;
  }

  .sg-news-page .filters {
    margin-bottom: 0;
  }

  .sg-news-page .filters__header {
    align-items: flex-start;
  }

  .sg-news-page .filters__label {
    font-size: 1.8rem;
  }

  .sg-news-page .filters__shell,
  .sg-news-page .article-results__shell,
  .sg-news-page .article-details__shell,
  .sg-news-page .article-intro__shell,
  .sg-news-page .article-body__shell,
  .sg-news-page .inline-image__shell {
    width: min(100% - 24px, var(--sg-content-shell-max-width));
    padding-top: 38px;
    padding-bottom: 38px;
  }

  .sg-news-page .article-results__top {
    margin-bottom: 20px;
  }

  .sg-news-page .article-results__count {
    font-size: 1.8rem;
  }

  .sg-news-page .filters__chips,
  .sg-news-page .filters__selected {
    gap: 10px;
  }

  .sg-news-page .article {
    grid-template-columns: 1fr;
    gap: 18px;
    padding: 24px 0;
  }

  .sg-news-page .article__content {
    min-height: auto;
  }

  .sg-news-page .article__image-wrap {
    height: 180px;
  }

  .sg-news-page .article__title {
    font-size: 2rem;
  }

  .sg-news-page .article__summary,
  .sg-news-page .article-results__empty-copy {
    font-size: 1.45rem;
  }

  .sg-news-page .card {
    min-height: auto;
  }

  .sg-news-page .card__img {
    display: none;
  }
}
`;

export default function Template(props) {
  const shell = props.component('spirax_shell', props);
  const article = props.currentArticle || props.currentContent || {};
  const relatedItems = Array.isArray(props.relatedArticleItems) ? props.relatedArticleItems : [];
  const sectionLabel = props.currentCategoryItem?.name || 'News';
  const masthead = props.component('spirax_short_masthead', {
    eyebrow: sectionLabel,
    title: article.title || props.title,
    summary: article.summary || article.description || '',
    image: article.image || article.primaryImage || props.image || '',
    imageAlt: article.title || props.title || sectionLabel,
    className: 'short-masthead'
  });
  const content = (
    <main className="sg-content-shell sg-news-page">
      {masthead}

      {article.date ? (
        <section className="bg--industrial-blue-light">
          <div className="article-details__shell">
            <div className="article-details">
              <h2 className="article-details__title">{article.date}</h2>
            </div>
          </div>
        </section>
      ) : null}

      <section className="bg--white">
        <div className="article-body__shell">
          <div className="article-body">
            <div className="article-body__copy">
              <div dangerouslySetInnerHTML={{ __html: article.bodyHtml || props.bodyHtml || '' }} />
            </div>
          </div>
        </div>
      </section>

      {relatedItems.length > 0 ? (
        <section className="bg--white clip-outside__wrap--small">
          <div className="wrapper wrapper--pad-l">
            <div className="content-card-grid">
              {relatedItems.map((item, index) => (
                <article className="content-card-grid__item content-card-grid__item--grey" key={item.url || item.title || index}>
                  {item.image ? <a className="content-card-grid__media" href={item.url || '#'}><img alt={item.title || ''} className="content-card-grid__image" src={item.image} /></a> : null}
                  <div className="content-card-grid__copy">
                    <h3 className="content-card-grid__title"><a href={item.url || '#'}>{item.title}</a></h3>
                    {item.summary ? <p className="content-card-grid__description">{item.summary}</p> : null}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
  return shell ? React.cloneElement(shell, {}, content) : content;
}
