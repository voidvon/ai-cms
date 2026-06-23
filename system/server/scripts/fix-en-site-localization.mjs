import { execute, queryOne } from '../src/db.mjs';

const EN_LANGUAGE_ID = queryOne(`SELECT id FROM languages WHERE code = 'en' LIMIT 1`)?.id || 0;
const ZH_LANGUAGE_ID = queryOne(`SELECT id FROM languages WHERE code = 'zh-CN' LIMIT 1`)?.id || 0;

if (!EN_LANGUAGE_ID) {
  throw new Error('Missing en language');
}

if (!ZH_LANGUAGE_ID) {
  throw new Error('Missing zh-CN language');
}

const now = new Date().toISOString();

const HOME_TEMPLATE_SOURCE = `
import React from 'react';

const PROMO_SLIDER_INLINE_SCRIPT = String.raw\`(() => {
  function initPromoSlider(slider) {
    if (!(slider instanceof HTMLElement) || slider.dataset.sliderInitialized === 'true') {
      return;
    }

    slider.dataset.sliderInitialized = 'true';

    const slidesList = slider.querySelector('.splide__list');
    const slides = Array.from(slider.querySelectorAll('.splide__slide'));
    const pagination = slider.querySelector('.splide__pagination');
    const prevBtn = slider.querySelector('.splide__arrow--prev');
    const nextBtn = slider.querySelector('.splide__arrow--next');

    if (!(slidesList instanceof HTMLElement) || !(pagination instanceof HTMLElement) || slides.length === 0) {
      return;
    }

    const slideWidth = 100 / slides.length;
    slidesList.style.width = String(slides.length * 100) + '%';
    slidesList.style.transition = 'transform 0.5s ease';
    slides.forEach((slide) => {
      if (!(slide instanceof HTMLElement)) {
        return;
      }
      slide.style.flex = '0 0 ' + slideWidth + '%';
      slide.style.maxWidth = slideWidth + '%';
    });

    pagination.innerHTML = '';

    let currentIndex = 0;
    let autoplayTimer = null;
    const autoplayInterval = 5000;

    slides.forEach((_, index) => {
      const dotItem = document.createElement('li');
      const button = document.createElement('button');
      button.className = 'splide__pagination__page';
      button.type = 'button';
      button.setAttribute('aria-label', 'Slide ' + (index + 1));
      button.addEventListener('click', () => goToSlide(index));
      dotItem.appendChild(button);
      pagination.appendChild(dotItem);
    });

    const dots = Array.from(pagination.querySelectorAll('.splide__pagination__page'));

    function updateButtons() {
      const disableControls = slides.length <= 1;
      if (prevBtn instanceof HTMLButtonElement) {
        prevBtn.disabled = disableControls;
      }
      if (nextBtn instanceof HTMLButtonElement) {
        nextBtn.disabled = disableControls;
      }
    }

    function stopAutoplay() {
      if (autoplayTimer) {
        clearInterval(autoplayTimer);
        autoplayTimer = null;
      }
    }

    function startAutoplay() {
      if (slides.length <= 1) {
        return;
      }
      stopAutoplay();
      autoplayTimer = window.setInterval(next, autoplayInterval);
    }

    function goToSlide(index) {
      if (index < 0 || index >= slides.length) {
        return;
      }

      currentIndex = index;
      slidesList.style.transform = 'translateX(-' + (index * slideWidth) + '%)';
      dots.forEach((dot, dotIndex) => {
        dot.classList.toggle('is-active', dotIndex === index);
      });
      updateButtons();
      startAutoplay();
    }

    function next() {
      goToSlide((currentIndex + 1) % slides.length);
    }

    function prev() {
      goToSlide((currentIndex - 1 + slides.length) % slides.length);
    }

    let touchStartX = 0;
    slidesList.addEventListener('touchstart', (event) => {
      touchStartX = event.changedTouches[0]?.screenX || 0;
    }, { passive: true });

    slidesList.addEventListener('touchend', (event) => {
      const touchEndX = event.changedTouches[0]?.screenX || 0;
      const diff = touchStartX - touchEndX;
      if (Math.abs(diff) <= 50) {
        return;
      }
      if (diff > 0) {
        next();
      } else {
        prev();
      }
    }, { passive: true });

    if (prevBtn instanceof HTMLButtonElement) {
      prevBtn.addEventListener('click', prev);
    }
    if (nextBtn instanceof HTMLButtonElement) {
      nextBtn.addEventListener('click', next);
    }

    slider.addEventListener('mouseenter', stopAutoplay);
    slider.addEventListener('mouseleave', startAutoplay);
    slider.addEventListener('focusin', stopAutoplay);
    slider.addEventListener('focusout', startAutoplay);
    slider.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') {
        prev();
      } else if (event.key === 'ArrowRight') {
        next();
      }
    });

    if (!slider.hasAttribute('tabindex')) {
      slider.setAttribute('tabindex', '0');
    }

    goToSlide(0);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      document.querySelectorAll('[data-promo-slider]').forEach(initPromoSlider);
    }, { once: true });
  } else {
    document.querySelectorAll('[data-promo-slider]').forEach(initPromoSlider);
  }
})();\`;

export const clientProps = false;

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function mapCards(items = [], options = {}) {
  const { defaultItemClassName = 'media-card-grid__item--grey' } = options;
  return toArray(items)
    .map((item) => ({
      title: item?.title || '',
      description: item?.description || item?.summary || '',
      image: item?.imageSrc || item?.image || '',
      imageAlt: item?.imageAlt || item?.title || '',
      href: item?.href || item?.url || item?.link || '',
      itemClassName: item?.itemClassName || ((item?.imageSrc || item?.image) ? defaultItemClassName : 'media-card-grid__item--light-blue')
    }))
    .filter((item) => item.title || item.description || item.href || item.image);
}

function normalizeValuePoints(items = []) {
  return toArray(items)
    .map((item) => ({
      title: item?.title || '',
      description: item?.description || '',
      href: item?.href || item?.link || '',
      linkText: item?.linkText || item?.label || item?.ctaLabel || 'Learn more'
    }))
    .filter((item) => item.title || item.description || item.href);
}

function normalizePromoSlides(items = []) {
  return toArray(items)
    .map((item) => ({
      kicker: item?.kicker || item?.eyebrow || '',
      title: item?.title || '',
      description: item?.description || item?.summary || '',
      image: item?.imageSrc || item?.image || '',
      href: item?.href || item?.url || item?.link || '',
      ctaLabel: item?.label || item?.ctaLabel || 'Discover more'
    }))
    .filter((item) => item.title || item.description || item.image || item.href);
}

export default function Template(props) {
  const { Raw } = props;
  const pageData = props.currentColumnPageData || props.pageData || {};
  const heroActions = toArray(pageData?.heroActions);
  const featuredCards = mapCards(pageData?.featuredCards, { defaultItemClassName: 'media-card-grid__item--grey' });
  const valuePoints = normalizeValuePoints(pageData?.valuePoints);
  const promoSlides = normalizePromoSlides(pageData?.promoCards);
  const industryCardsData = mapCards(pageData?.industries, { defaultItemClassName: 'media-card-grid__item--grey' });
  const latestProductsConfig = pageData?.latestProducts || {};
  const latestProducts = Array.isArray(props.homeFeaturedProductItems)
    ? props.homeFeaturedProductItems.slice(0, Number(latestProductsConfig?.limit || 4))
    : [];

  const latestProductCards = props.component('media_card_grid', {
    cards: latestProducts.map((product) => ({
      title: product?.name || product?.title || '',
      description: product?.summary || product?.description || '',
      image: product?.image || '',
      imageAlt: product?.imageAlt || product?.name || product?.title || '',
      href: product?.url || product?.link || product?.href || ''
    })),
    wrapperClassName: 'sg-home__latest-products-grid'
  });

  const productSolutionCards = props.component('media_card_grid', {
    cards: featuredCards,
    imageAspectRatio: '4 / 3'
  });

  const industryCards = props.component('media_card_grid', {
    cards: industryCardsData,
    wrapperClassName: 'sg-home__latest-products-grid'
  });

  const masthead = props.component('short_masthead', {
    className: 'banner-primary hero-banner',
    image: pageData?.heroImage || props.currentColumnHeroImage || '',
    imageAlt: pageData?.heroImageAlt || pageData?.title || props.title || '',
    size: 'hero',
    textClassName: 'banner-primary__content',
    bodyClassName: 'banner-primary__holder',
    slots: {
      body: (
        <>
          <h1 className="banner-primary__title">{pageData?.title || props.title || props.site?.web_name || ''}</h1>
          {pageData?.summary ? <p className="banner-primary__copy">{pageData.summary}</p> : null}
          {heroActions.length > 0 ? (
            <div className="banner-primary__slot">
              <div className="sg-home__hero-actions">
                {heroActions.map((action, index) => (
                  <div
                    className={index === 0 ? 'sg-primary-cta' : 'button-component'}
                    key={action?.href || action?.label || index}
                  >
                    {props.component('button', {
                      href: action?.href || '#',
                      variant: action?.variant || (index === 0 ? 'neutral' : 'outline-light'),
                      size: action?.size || undefined,
                      children: <span>{action?.label || ''}</span>
                    })}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      )
    }
  });

  const shell = props.component('shell', {
    ...props,
    slots: {
      ...(props.slots || {}),
      masthead
    }
  });

  const content = (
    <article className="sg-home" data-home-page>
      {featuredCards.length > 0 ? (
        <section className="bg--white">
          <div className="wrapper home-section__lead">
            <div className="section-header home-section__header">
              <h2 className="section-header__title">{pageData?.featuredTitle || ''}</h2>
            </div>
            {pageData?.solutionsIntro ? <p className="sg-home__section-intro">{pageData.solutionsIntro}</p> : null}
          </div>
          <div className="wrapper home-section__body">
            {productSolutionCards}
          </div>
        </section>
      ) : null}

      {valuePoints.length > 0 ? (
        <section className="value-points bg--light-blue">
          <div className="wrapper home-section__shell">
            <div>
              <div className="section-header home-section__header">
                <h2 className="section-header__title">{pageData?.solutionsTitle || ''}</h2>
              </div>
              <div className="sg-home__value-grid">
                {valuePoints.map((item, index) => (
                  <article className="sg-home__value-card" key={item?.title || index}>
                    {item?.title ? <h3>{item.title}</h3> : null}
                    {item?.description ? <p>{item.description}</p> : null}
                    {item?.href ? <a className="sg-home__value-link" href={item.href}>{item.linkText}</a> : null}
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {latestProducts.length > 0 ? (
        <section className="latest-products-section bg--light-blue">
          <div className="wrapper home-section__lead">
            <div className="section-header home-section__header">
              <h2 className="section-header__title">{latestProductsConfig?.title || ''}</h2>
            </div>
            {latestProductsConfig?.intro ? <p className="sg-home__section-intro">{latestProductsConfig.intro}</p> : null}
          </div>
          <div className="wrapper home-section__body home-section__body--stack">
            {latestProductCards}
            {latestProductsConfig?.ctaHref && latestProductsConfig?.ctaLabel ? (
              <div className="button-component sg-home__latest-products-cta">
                {props.component('button', {
                  href: latestProductsConfig.ctaHref,
                  children: <span>{latestProductsConfig.ctaLabel}</span>
                })}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {promoSlides.length > 0 ? (
        <section className="promo-slider bg--white">
          <div className="wrapper promo-slider__shell home-section__shell">
            <div className="slider splide" data-promo-slider>
              <div className="slider__frame splide__track">
                <ul className="slider__slides splide__list">
                  {promoSlides.map((slide, index) => (
                    <li className="slide splide__slide" key={slide?.href || slide?.title || index}>
                      <div
                        className="slide__bg"
                        style={slide?.image ? { backgroundImage: 'url("' + slide.image + '")' } : undefined}
                      ></div>
                      <div className="slide__inner">
                        <div className="slide__panel slide__panel--copy">
                          <div className="slide__content">
                            {slide?.kicker ? <h2 className="slide__title">{slide.kicker}</h2> : null}
                            <div className="slide__copy">
                              {slide?.title ? <h3 className="slide__heading">{slide.title}</h3> : null}
                              {slide?.description ? (
                                <div className="slide__description">
                                  <p>{slide.description}</p>
                                </div>
                              ) : null}
                              {slide?.href && slide?.ctaLabel ? props.component('button', {
                                href: slide.href,
                                variant: 'neutral',
                                children: <span>{slide.ctaLabel}</span>
                              }) : null}
                            </div>
                          </div>
                        </div>
                        <div aria-hidden="true" className="slide__panel slide__panel--media"></div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="slider__wrapper">
                <ul className="splide__pagination slider__nav"></ul>
                <div className="splide__arrows slider__controls">
                  <button aria-label="Previous slide" className="splide__arrow splide__arrow--prev slider__control" type="button">
                    <svg aria-hidden="true" className="slider__control-icon" fill="none" viewBox="0 0 24 24">
                      <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"></path>
                    </svg>
                  </button>
                  <button aria-label="Next slide" className="splide__arrow splide__arrow--next slider__control" type="button">
                    <svg aria-hidden="true" className="slider__control-icon" fill="none" viewBox="0 0 24 24">
                      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"></path>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {pageData?.contactCallout?.title ? (
        props.component('promo_banner', {
          sectionClassName: 'contact-section promo-bg',
          sectionStyle: pageData?.contactCallout?.backgroundImage
            ? { backgroundImage: 'url("' + pageData.contactCallout.backgroundImage + '")' }
            : undefined,
          copyClassName: 'promo-banner__copy--centered',
          titleClassName: 'promo-banner__title--centered',
          title: pageData.contactCallout.title,
          subtitle: pageData.contactCallout.subtitle || '',
          actionsClassName: 'promo-banner__cta--double',
          actionsPlacement: 'inside-copy',
          actions: [
            ...(pageData?.contactCallout?.contactSecondaryHref && pageData?.contactCallout?.contactSecondaryLabel ? [{
              href: pageData.contactCallout.contactSecondaryHref,
              label: pageData.contactCallout.contactSecondaryLabel,
              variant: 'outline-light',
              size: 'lg'
            }] : []),
            ...(pageData?.contactCallout?.contactHref && pageData?.contactCallout?.contactLabel ? [{
              href: pageData.contactCallout.contactHref,
              label: pageData.contactCallout.contactLabel,
              variant: 'neutral',
              size: 'lg'
            }] : [])
          ]
        })
      ) : null}

      {industryCardsData.length > 0 ? (
        <section className="industries-section bg--light-blue">
          <div className="wrapper home-section__lead">
            <div className="section-header home-section__header">
              <h2 className="section-header__title">{pageData?.industriesTitle || ''}</h2>
            </div>
          </div>
          <div className="wrapper home-section__body">
            {industryCards}
          </div>
        </section>
      ) : null}

      <Raw html={'<script>' + PROMO_SLIDER_INLINE_SCRIPT + '</script>'} />
    </article>
  );

  return shell ? React.cloneElement(shell, {}, content) : content;
}
`;

const SITE_NAV_TEMPLATE_SOURCE = String.raw`
import React from 'react';

function normalizeUrl(value = '') {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  if (normalized === '/index.html') return '/';
  return normalized.endsWith('/index.html') ? normalized.slice(0, -10) || '/' : normalized;
}

function isCurrentUrlActive(itemUrl = '', currentUrl = '') {
  const normalizedItemUrl = normalizeUrl(itemUrl);
  const normalizedCurrentUrl = normalizeUrl(currentUrl);
  if (!normalizedItemUrl || !normalizedCurrentUrl) return false;
  if (normalizedItemUrl === '/') return normalizedCurrentUrl === '/';
  return normalizedCurrentUrl === normalizedItemUrl || normalizedCurrentUrl.startsWith(normalizedItemUrl.endsWith('/') ? normalizedItemUrl : normalizedItemUrl + '/');
}

function hasActiveChild(children = [], currentUrl = '') {
  return children.some((child) => isCurrentUrlActive(child?.url || '', currentUrl));
}

function renderNavItems(items = [], currentUrl = '') {
  return items.map((item, index) => {
    const children = Array.isArray(item.children) ? item.children.filter((child) => child?.url) : [];
    const isActive = Boolean(item?.active) || isCurrentUrlActive(item?.url || '', currentUrl) || hasActiveChild(children, currentUrl);

    if (children.length > 0) {
      return (
        <li className="sg-global-nav__main-item" data-nav-group="" key={item.url || item.name || index}>
          <button
            aria-controls={'site-nav-flyout-' + index}
            aria-expanded="false"
            aria-haspopup="true"
            className={['sg-global-nav__main-link', 'sg-global-nav__main-trigger', isActive ? 'is-active' : ''].filter(Boolean).join(' ')}
            data-nav-group-toggle=""
            type="button"
          >
            {item.name}
          </button>
          <div className="sg-global-nav__flyout" id={'site-nav-flyout-' + index}>
            <div className="sg-global-nav__flyout-panel">
              <div className="sg-global-nav__flyout-header">
                <a className="sg-global-nav__flyout-head-link" href={item.url || '#'}>{item.name}</a>
              </div>
              <ul className="sg-global-nav__flyout-list">
                {children.map((child, childIndex) => (
                  <li className="sg-global-nav__flyout-item" key={child.url || child.name || childIndex}>
                    <a
                      className={['sg-global-nav__flyout-link', isCurrentUrlActive(child?.url || '', currentUrl) ? 'is-active' : ''].filter(Boolean).join(' ')}
                      href={child.url || '#'}
                      rel={child.openInNewTab ? 'noreferrer' : undefined}
                      target={child.openInNewTab ? '_blank' : undefined}
                    >
                      {child.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </li>
      );
    }

    return (
      <li className="sg-global-nav__main-item" key={item.url || item.name || index}>
        <a
          className={['sg-global-nav__main-link', isActive ? 'is-active' : ''].filter(Boolean).join(' ')}
          href={item.url || '#'}
          rel={item.openInNewTab ? 'noreferrer' : undefined}
          target={item.openInNewTab ? '_blank' : undefined}
        >
          {item.name}
        </a>
      </li>
    );
  });
}

function renderUtilityItems(items = [], currentUrl = '') {
  return items
    .filter((item) => item?.url)
    .map((item, index) => (
      <li key={item.url || item.name || index}>
        <a className={['sg-global-nav__utility-link', isCurrentUrlActive(item?.url || '', currentUrl) ? 'is-active' : ''].filter(Boolean).join(' ')} href={item.url || '#'}>
          {item.name}
        </a>
      </li>
    ));
}

export default function Component(props) {
  const { site, siteColumns = [], utilityColumns = [], currentPage } = props || {};
  const currentUrl = currentPage?.url || '';
  const ui = site?.template_data?.ui || {};
  const navLabels = ui?.nav || {};
  const contactHref = navLabels?.contactHref || '/contact-us/';

  return (
    <div className="sg-site-nav-shell" data-site-nav="">
      <header className="sg-global-nav">
        <div className="sg-global-nav__topbar">
          <div className="sg-global-nav__inner">
            <a aria-label={site?.company_name || site?.web_name || 'Site'} className="sg-global-nav__brand" href="/">
              <img
                alt={site?.company_name || site?.web_name || 'Spirax Sarco'}
                className="sg-global-nav__brand-mark"
                height="50"
                src="/logo.svg"
                width="171"
              />
            </a>

            <div className="sg-global-nav__launchers">
              <nav aria-label={navLabels?.utilityAriaLabel || 'Utility navigation'} className="sg-global-nav__utility sg-global-nav__utility--inline">
                <ul className="sg-global-nav__utility-list">
                  {renderUtilityItems(utilityColumns, currentUrl)}
                </ul>
              </nav>

              <div className="sg-global-nav__search">
                <button
                  aria-controls="sg-global-search-dialog"
                  aria-haspopup="dialog"
                  aria-label={navLabels?.searchAriaLabel || 'Open search'}
                  className="sg-search-button sg-global-nav__action-button sg-global-nav__action-button--search"
                  data-search-open=""
                  title={navLabels?.searchTitle || navLabels?.searchAriaLabel || 'Open search'}
                  type="button"
                >
                  <svg aria-hidden="true" className="sg-search-button__icon" fill="none" viewBox="0 0 24 24">
                    <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8"></circle>
                    <path d="m16 16 4.5 4.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8"></path>
                  </svg>
                </button>
              </div>

              <button
                aria-controls="site-main-nav"
                aria-expanded="false"
                aria-label={navLabels?.menuAriaLabel || 'Menu'}
                className="sg-nav-hamburger sg-global-nav__action-button sg-global-nav__action-button--menu sg-global-nav__menu-toggle"
                data-nav-toggle=""
                type="button"
              >
                <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                  <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8"></path>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div aria-hidden="true" className="sg-global-nav__drawer-backdrop" data-nav-backdrop=""></div>

      <div className="sg-global-nav__main sg-global-nav__main--desktop" data-nav-panel="" id="site-main-nav">
        <div className="sg-global-nav__main-inner">
          <nav aria-label={navLabels?.utilityAriaLabel || 'Utility navigation'} className="sg-global-nav__utility sg-global-nav__utility--panel">
            <ul className="sg-global-nav__utility-list">
              {renderUtilityItems(utilityColumns, currentUrl)}
            </ul>
          </nav>

          <nav aria-label={navLabels?.mainAriaLabel || 'Main navigation'}>
            <ul className="sg-global-nav__main-list">
              {renderNavItems(siteColumns, currentUrl)}
            </ul>
          </nav>

          <div className="sg-primary-cta sg-primary-cta--badge-left sg-primary-cta--badge-desktop-left sg-primary-cta--badge-mobile-right">
            {props.component('button', {
              href: contactHref,
              variant: 'warning',
              children: <span>{navLabels?.contactLabel || 'Contact us'}</span>
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
`;

const GLOBAL_SEARCH_TEMPLATE_SOURCE = String.raw`
import React from 'react';

export default function Component(props) {
  const siteSearchMessages = props?.site?.template_data?.ui?.search || {};
  const messages = {
    cancelLabel: 'Cancel',
    clearLabel: 'Clear search',
    closeLabel: 'Close search',
    emptyBody: 'No matching content was found. Try a different keyword.',
    emptyTitle: 'No results found',
    loadingLabel: 'Searching...',
    placeholder: 'Search products, articles or solutions',
    resultsLabel: 'Site search results',
    unavailableBody: 'Search is currently unavailable. Please try again later.',
    unavailableTitle: 'Search unavailable',
    ...siteSearchMessages,
    ...(props?.messages && typeof props.messages === 'object' ? props.messages : {})
  };
  const searchApiUrl = String(props?.searchApiUrl || '/api/search').trim() || '/api/search';

  return (
    <div
      className="sg-global-search"
      data-global-search=""
      data-search-api-url={searchApiUrl}
      data-search-messages={JSON.stringify(messages)}
      hidden
    >
      <button
        aria-label={messages.closeLabel}
        className="sg-global-search__backdrop"
        data-global-search-close=""
        type="button"
      ></button>

      <section
        aria-label={messages.resultsLabel}
        aria-modal="true"
        className="sg-global-search__panel"
        id="sg-global-search-dialog"
        role="dialog"
      >
        <div className="sg-global-search__topbar">
          <div className="sg-global-search__field-shell">
            <svg aria-hidden="true" className="sg-global-search__icon" fill="none" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8"></circle>
              <path d="m16 16 4.5 4.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8"></path>
            </svg>
            <input
              autoComplete="off"
              className="sg-global-search__input"
              data-global-search-input=""
              name="q"
              placeholder={messages.placeholder}
              spellCheck="false"
              type="search"
            />
            <button
              aria-label={messages.clearLabel}
              className="sg-global-search__clear"
              data-global-search-clear=""
              hidden
              type="button"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
          <button
            aria-label={messages.closeLabel}
            className="sg-global-search__close"
            data-global-search-close=""
            type="button"
          >
            {messages.cancelLabel}
          </button>
        </div>

        <div className="sg-global-search__results-shell">
          <div className="sg-global-search__state" data-global-search-state="" hidden></div>
          <div className="sg-global-search__results" data-global-search-results="" hidden></div>
        </div>
      </section>
    </div>
  );
}
`;

const BREADCRUMBS_TEMPLATE_SOURCE = String.raw`
import React from 'react';

export default function Component(props) {
  const {
    ariaLabel = 'Breadcrumb',
    homeHref = '/',
    homeLabel = 'Home',
    includeHome = true,
    includeItemsWrapper = true,
    items = [],
    currentContent = null,
    currentColumn = [],
    currentSection = null,
    tag = 'div'
  } = props || {};

  const normalizedItems = Array.isArray(items)
    ? items
        .filter((item) => item && String(item?.label || item?.name || '').trim())
        .map((item) => ({
          current: Boolean(item?.current),
          href: String(item?.href || item?.url || '').trim(),
          label: String(item?.label || item?.name || '').trim()
        }))
    : [];

  const sectionName = String(currentSection?.name || '').trim();
  const sectionUrl = String(currentSection?.url || '').trim();
  const sectionType = String(currentSection?.type || '').trim().toLowerCase();
  const columnItems = Array.isArray(currentColumn)
    ? currentColumn
        .filter((item) => item && String(item?.name || item?.label || '').trim())
        .map((item) => ({
          href: String(item?.url || item?.href || '').trim(),
          label: String(item?.name || item?.label || '').trim()
        }))
    : [];
  const contentTitle = String(currentContent?.title || currentContent?.name || '').trim();

  const shouldIncludeSection = Boolean(sectionName)
    && (
      columnItems.length === 0
      || !['content', 'page-tree'].includes(sectionType)
    );
  const derivedItems = [
    ...(shouldIncludeSection ? [{ label: sectionName, href: sectionUrl }] : []),
    ...columnItems,
    ...(contentTitle ? [{ label: contentTitle, href: '', current: true }] : [])
  ];

  const sourceItems = normalizedItems.length > 0 ? normalizedItems : derivedItems;
  if (sourceItems.length === 0) {
    return null;
  }

  const firstItem = sourceItems[0] || null;
  const normalizedHomeHref = String(homeHref || '').trim();
  const firstHref = String(firstItem?.href || firstItem?.url || '').trim();
  const firstLabel = String(firstItem?.label || '').trim();
  const firstItemIsHome = Boolean(firstItem)
    && firstLabel === homeLabel
    && (firstHref === normalizedHomeHref || firstHref === '/index.html' || firstHref === '/');
  const homePrependedItems = includeHome
    ? [
        { label: homeLabel, href: normalizedHomeHref || '/' },
        ...(firstItemIsHome ? sourceItems.slice(1) : sourceItems)
      ]
    : sourceItems;
  const resolvedItems = homePrependedItems.reduce((acc, item) => {
    const previous = acc[acc.length - 1] || null;
    if (previous && previous.label === item.label && previous.href === item.href) {
      return acc;
    }
    acc.push(item);
    return acc;
  }, []);
  const hasExplicitCurrent = resolvedItems.some((item) => Boolean(item?.current));
  const finalizedItems = resolvedItems.map((item, index) => {
    const isLast = index === resolvedItems.length - 1;
    if (Boolean(item?.current) || (!hasExplicitCurrent && isLast)) {
      return {
        ...item,
        current: true,
        href: ''
      };
    }
    return item;
  });
  const Tag = tag === 'nav' ? 'nav' : 'div';
  const content = finalizedItems.map((item, index) => {
    const isCurrent = Boolean(item?.current);
    return (
      <React.Fragment key={(item?.label || '') + '-' + index}>
        {isCurrent ? (
          <span className="breadcrumb__link is-current">{item?.label || ''}</span>
        ) : (
          <a className="breadcrumb__link" href={item?.href || '#'}>{item?.label || ''}</a>
        )}
        {index < finalizedItems.length - 1 ? <span aria-hidden="true" className="breadcrumb__sep">/</span> : null}
      </React.Fragment>
    );
  });

  return (
    <Tag aria-label={ariaLabel} className="breadcrumb">
      <div className="wrapper" style={{ display: 'flex', minHeight: '42px', alignItems: 'center' }}>
        {includeItemsWrapper ? (
          <div className="breadcrumb__items">
            <div className="breadcrumb__items-wrap">{content}</div>
          </div>
        ) : (
          <div className="breadcrumb__items-wrap">{content}</div>
        )}
      </div>
    </Tag>
  );
}
`;

const SHELL_TEMPLATE_SOURCE = String.raw`
import React from 'react';

function renderFooterLinks(columns = []) {
  const groups = columns.filter((item) => item?.url && item?.name);
  return groups.map((group, index) => {
    const childLinks = Array.isArray(group.children) ? group.children.filter((item) => item?.url && item?.name) : [];
    const links = childLinks.length > 0
      ? childLinks.slice(0, 8)
      : [{ name: group.name, url: group.url, openInNewTab: group.openInNewTab }];
    return (
      <section className="sg-site-footer__section" data-footer-section="" key={group.url || group.name || index}>
        <h2 className="sg-site-footer__title sg-site-footer__title--desktop" id={'site-footer-heading-' + index}>{group.name}</h2>
        <button
          aria-controls={'site-footer-section-' + index}
          aria-expanded="false"
          className="sg-site-footer__trigger sg-site-footer__trigger--mobile"
          data-footer-toggle=""
          type="button"
        >
          <span className="sg-site-footer__title">{group.name}</span>
          <span aria-hidden="true" className="sg-site-footer__chevron"></span>
        </button>
        <ul className="sg-site-footer__list" id={'site-footer-section-' + index}>
          {links.map((link, linkIndex) => (
            <li className="sg-site-footer__item" key={link.url || link.name || linkIndex}>
              <a className="sg-site-footer__link" href={link.url || '#'} target={link.openInNewTab ? '_blank' : undefined} rel={link.openInNewTab ? 'noreferrer' : undefined}>
                {link.name}
              </a>
            </li>
          ))}
        </ul>
      </section>
    );
  });
}

export default function Template({ site, siteColumns = [], utilityColumns = [], currentPage, currentContent, currentColumn, currentSection, children, slots = {}, component }) {
  const pageTitle = currentPage?.title ? (currentPage.title + ' - ' + (site?.web_name || '')) : (site?.web_name || '');
  const isHomePage = currentPage?.type === 'home' || currentPage?.url === '/' || currentPage?.url === '/index.html';
  const ui = site?.template_data?.ui || {};
  const breadcrumbLabels = ui?.breadcrumb || {};
  const searchProps = {
    site
  };
  const breadcrumbs = !isHomePage && typeof component === 'function'
    ? component('breadcrumbs', {
        ariaLabel: breadcrumbLabels?.ariaLabel || 'Breadcrumb navigation',
        currentContent,
        currentColumn,
        currentSection,
        homeHref: breadcrumbLabels?.homeHref || '/',
        homeLabel: breadcrumbLabels?.homeLabel || 'Home',
        includeItemsWrapper: false,
        tag: 'nav'
      })
    : null;
  return (
    <html lang={site?.requested_language_code || site?.current_language_code || 'en'}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{pageTitle}</title>
      </head>
      <body>
        {typeof component === 'function' ? component('site_nav', { site, siteColumns, utilityColumns, currentPage }) : null}
        {typeof component === 'function' ? component('global_search', searchProps) : null}

        {slots?.masthead || null}
        {slots?.breadcrumbs || breadcrumbs || null}
        {children}

        <footer className="sg-site-footer" role="contentinfo">
          <div className="sg-site-footer__top">
            <div className="sg-site-footer__inner">
              <div className="sg-site-footer__grid">
                {renderFooterLinks(siteColumns)}
              </div>
            </div>
          </div>
          <div className="sg-site-footer__bottom">
            <div className="sg-site-footer__inner">
              <div className="sg-site-footer__meta">
                <div className="sg-site-footer__records">
                  <p>{site?.web_copyright || site?.company_name || site?.web_name || ''}</p>
                  {site?.icp_number ? <p>{site.icp_number}</p> : null}
                  {site?.company_phone ? <p>{site.company_phone}</p> : null}
                  {site?.company_address ? <p>{site.company_address}</p> : null}
                </div>
              </div>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
`;

const HOME_DATA_EN = {
  title: 'Spirax Sarco Steam Solutions for Industrial Steam Systems',
  summary: 'Spirax Sarco steam expertise for industrial systems worldwide',
  heroImage: '/images/global/generic-header-images/header_engineers_07-60993fae75.jpg',
  featuredTitle: 'Explore Spirax Sarco products and solutions for the steam and condensate loop',
  solutionsIntro: 'Many visitors begin with the Spirax Sarco brand, then refine into steam traps, pressure control, flow measurement, condensate recovery or service support. The homepage should capture that brand intent first and guide international visitors into the right solution path.',
  solutionsTitle: 'Why international teams choose Spirax Sarco solutions',
  heroActions: [
    {
      label: 'Talk to our team',
      href: '/contact-us/',
      variant: 'neutral'
    }
  ],
  featuredCards: [
    {
      title: 'Steam traps',
      description: 'Explore thermodynamic, thermostatic and mechanical steam trap solutions designed to protect equipment, reduce steam loss and improve condensate recovery across process and distribution applications.',
      imageSrc: '/images/global/products/steam_traps_02-97182c4207.jpg',
      href: '/products/steam-traps',
      label: 'Explore steam traps'
    },
    {
      title: 'Pressure control and valves',
      description: 'Discover pressure reducing valves, control valves and related system components that help match steam pressure, protect downstream equipment and support stable process control.',
      imageSrc: '/images/global/products/control-valves/pressure_reducing_surplussing_valve_dp27e_01-a5e41169f1.jpg',
      href: '/products/control-systems/pressure-reducing-and-surplussing-valves',
      label: 'View pressure control'
    },
    {
      title: 'Condensate recovery',
      description: 'Improve condensate return, reduce wasted flash steam and support more efficient steam systems with condensate pumps, recovery packages and integrated energy recovery solutions.',
      imageSrc: '/images/global/products/easiheat_gen4-unit4_dhw_dual-4820852_main_no_refl_v3_1440x810-7101139780.jpg',
      href: '/products/condensate-and-heat-recovery-systems',
      label: 'See recovery solutions'
    },
    {
      title: 'Flowmetering',
      description: 'Measure steam, liquids and gases with flowmetering technologies that support energy management, system balancing and more confident process decisions.',
      imageSrc: '/images/global/products/flowmetering_02-7e67646194.jpg',
      href: '/products/flowmetering',
      label: 'Explore flowmetering'
    },
    {
      title: 'Boiler controls and systems',
      description: 'Support steam quality, boiler efficiency and safer operation with boiler controls, blowdown systems, feedtanks and related boilerhouse solutions.',
      imageSrc: '/images/global/products/boilerhouse_01-0d6d9e8d4f.jpg',
      href: '/products/boiler-controls-and-systems',
      label: 'Explore boiler controls'
    },
    {
      title: 'Steam system services',
      description: 'Go beyond component supply with audits, monitoring, commissioning, maintenance support and engineered steam-system improvements built around plant reliability and efficiency.',
      imageSrc: '/images/global/dotcom-home/hero/q2-2023/gettyimages-1481065126-31b88d3a67.jpg',
      href: '/services',
      label: 'Explore services'
    }
  ],
  valuePoints: [
    {
      title: 'Product breadth with system context',
      description: 'Navigate from broad brand research into steam traps, pressure control, flowmetering and condensate recovery without losing the system context.',
      href: '/products',
      linkText: 'Learn more'
    },
    {
      title: 'Services that support the full lifecycle',
      description: 'Use services, audits, monitoring and engineering support to move from reactive maintenance toward a more efficient and reliable steam operation.',
      href: '/services',
      linkText: 'Learn more'
    },
    {
      title: 'Industry-specific application support',
      description: 'Match solutions to process demands across food and beverage, pharmaceutical, hospitals, oil and gas, OEM and other industrial sectors.',
      href: '/industries',
      linkText: 'Learn more'
    }
  ],
  latestProducts: {
    title: 'Latest products',
    intro: 'This section surfaces recently added product detail pages that are explicitly marked for homepage visibility, giving buyers a clear route to new models while providing search engines with stable discovery links.',
    limit: 4,
    ctaLabel: 'Browse all products',
    ctaHref: '/products'
  },
  promoCards: [
    {
      kicker: 'Steam expertise',
      title: 'Build a stronger steam system foundation',
      description: 'Understand how steam quality, distribution and condensate management fit together across the full steam loop.',
      imageSrc: '/images/global/dotcom-home/promo-carousel/campaign_benefits_of_steam-4ceaa7fc14.jpg',
      href: '/promo/benefits-of-steam',
      label: 'Discover more'
    },
    {
      kicker: 'Energy saving',
      title: 'Energy efficiency and heat recovery',
      description: 'See practical opportunities to reduce losses, recover heat and improve plant-wide performance without sacrificing reliability.',
      imageSrc: '/images/global/dotcom-home/promo-carousel/campaign_energy_saving_01-53e3011d6e.jpg',
      href: '/promo/key-energy-saving-tips',
      label: 'Explore efficiency ideas'
    },
    {
      kicker: 'Flowmetering solutions',
      title: 'Flow data that supports better decisions',
      description: 'Learn how better measurement helps validate demand, improve control and support smarter system decisions.',
      imageSrc: '/images/global/dotcom-home/promo-carousel/campaign_flowmetering_01-ed5970301c.jpg',
      href: '/promo/flowmetering-solutions',
      label: 'Discover more'
    },
    {
      kicker: 'Services and monitoring',
      title: 'Keep critical steam assets visible and under control',
      description: 'Combine maintainable hardware, monitoring and specialist support to strengthen uptime and cut avoidable losses.',
      imageSrc: '/images/global/dotcom-home/hero/q2-2023/gettyimages-1481065126-31b88d3a67.jpg',
      href: '/services/wireless-steam-trap-monitoring',
      label: 'Discover more'
    }
  ],
  contactCallout: {
    backgroundImage: '/images/global/contact-us/contact-us-background-a13bcb7af3.jpg',
    title: 'Spirax Sarco steam expertise, built around your system',
    subtitle: 'Connect with Spirax Sarco specialists for product guidance, project support and local sales coordination.',
    contactLabel: 'Talk to our team',
    contactHref: '/contact-us/',
    contactSecondaryLabel: 'About Spirax Sarco',
    contactSecondaryHref: '/about-us/'
  },
  industriesTitle: 'Solutions shaped around your industry and application',
  industries: [
    {
      title: 'Brewing and distilling',
      imageSrc: '/images/global/industries/industry-mastheads-1440-_-810/industry-cards_brewing-772d6e6acb.jpg',
      href: '/industries/brewing-and-distilling'
    },
    {
      title: 'Food and beverage',
      imageSrc: '/images/global/industries/industry-mastheads-1440-_-810/industry-cards_food_bev-dc1d8868be.jpg',
      href: '/industries/food-and-beverage'
    },
    {
      title: 'Hospitals',
      imageSrc: '/images/global/industries/industry-mastheads-1440-_-810/industry-cards_healthcare-c2194193bc.jpg',
      href: '/industries/hospitals'
    },
    {
      title: 'Oil and gas',
      imageSrc: '/images/global/industries/industry-mastheads-1440-_-810/industry-cards_oil_gas-e8b418a8de.jpg',
      href: '/industries/oil-and-gas'
    },
    {
      title: 'Pharmaceutical',
      imageSrc: '/images/global/industries/industry-mastheads-1440-_-810/industry-cards_pharma-8087e3a62f.jpg',
      href: '/industries/pharmaceutical'
    },
    {
      title: 'OEM',
      imageSrc: '/images/global/dotcom-home/split-images/81644_industry-box-1-2a0ffea765.jpg',
      href: '/industries/oem'
    }
  ]
};

const HOME_DATA_ZH = {
  title: 'Spirax Sarco 斯派莎克蒸汽系统解决方案',
  summary: 'Spirax Sarco 斯派莎克面向工业蒸汽系统的专业能力',
  heroImage: '/uploads/images/202606/page-heroes/col-70-services-header_services-landing-2615902fa9.jpg',
  featuredTitle: '探索 Spirax Sarco 斯派莎克蒸汽与冷凝水回路产品及解决方案',
  solutionsIntro: '许多访客会先搜索 Spirax Sarco 或斯派莎克品牌，再进一步查找蒸汽疏水、压力控制、流量测量、冷凝水回收与系统服务。首页应先承接品牌词意图，再帮助访客快速进入合适的解决方案路径。',
  solutionsTitle: '为什么工业团队选择斯派莎克解决方案',
  heroActions: [
    {
      label: '联系中国公司',
      href: '/contact-us/',
      variant: 'neutral'
    }
  ],
  featuredCards: [
    {
      title: '蒸汽疏水阀',
      description: '探索热静力式、机械式和恒温式蒸汽疏水阀方案，帮助您在工艺用汽和蒸汽输送场景中降低蒸汽损失、保护设备并提升冷凝水回收效率。',
      imageSrc: '/uploads/images/202606/steam_traps_02-97182c4207.jpg',
      href: '/products/steam-traps/',
      label: '查看蒸汽疏水阀'
    },
    {
      title: '压力控制与阀门',
      description: '发现减压阀、控制阀及相关控制系统组件，帮助您匹配蒸汽压力、保护下游设备，并为稳定的工艺控制提供支持。',
      imageSrc: '/uploads/images/202606/pressure_reducing_surplussing_valve_dp27e_01-a5e41169f1.jpg',
      href: '/products/control-systems/pressure-reducing-and-surplussing-valves/',
      label: '查看压力控制方案'
    },
    {
      title: '冷凝水回收',
      description: '通过冷凝水泵、回收系统和热量回收方案，提高冷凝水回收效率，减少闪蒸损失，并为蒸汽系统节能改造提供支持。',
      imageSrc: '/uploads/images/202606/easiheat_gen4-unit4_dhw_dual-4820852_main_no_refl_v3_1440x810-7101139780.jpg',
      href: '/products/condensate-and-heat-recovery-systems/',
      label: '查看回收方案'
    },
    {
      title: '流量计',
      description: '无论您的工艺对象是蒸汽、液体还是气体，斯派莎克都能提供适配的流量测量方案，帮助您做好能源管理、系统平衡与过程优化。',
      imageSrc: '/uploads/images/202606/flowmetering_02-7e67646194.jpg',
      href: '/products/flowmetering/',
      label: '查看流量计方案'
    },
    {
      title: '锅炉控制系统',
      description: '通过锅炉控制、排污系统、给水除氧箱及相关锅炉房方案，帮助您提升蒸汽品质、锅炉效率和运行安全性。',
      imageSrc: '/uploads/images/202606/boilerhouse_01-0d6d9e8d4f.jpg',
      href: '/products/boiler-controls-and-systems/',
      label: '查看锅炉控制系统'
    },
    {
      title: '蒸汽系统服务',
      description: '从系统调研、监测到安装调试和维护支持，斯派莎克不仅提供产品，也帮助您持续优化蒸汽系统的可靠性与运行效率。',
      imageSrc: '/uploads/images/202606/page-heroes/col-70-services-header_services-landing-2615902fa9.jpg',
      href: '/services/',
      label: '查看服务能力'
    }
  ],
  valuePoints: [
    {
      title: '产品广度与系统视角并重',
      description: '在保持系统视角的前提下，从品牌入口顺畅进入蒸汽疏水阀、压力控制、流量测量与冷凝水回收等核心产品族。',
      href: '/products/',
      linkText: '了解更多'
    },
    {
      title: '覆盖系统生命周期的服务支持',
      description: '通过调研、监测、安装调试和维护支持，从被动维修逐步走向更高效、更可靠的蒸汽系统运营。',
      href: '/services/',
      linkText: '了解更多'
    },
    {
      title: '贴近行业场景的应用支持',
      description: '围绕食品饮料、制药、医院、石化、OEM 等行业场景，匹配适合的蒸汽系统应用与解决方案。',
      href: '/industries/',
      linkText: '了解更多'
    }
  ],
  latestProducts: {
    title: '最新产品',
    intro: '这里展示最近上线并已明确标记的产品详情页，帮助访客快速发现新型号，也为搜索引擎提供稳定的新产品入口。',
    limit: 4,
    ctaLabel: '查看全部产品',
    ctaHref: '/products/'
  },
  promoCards: [
    {
      kicker: 'Steam expertise',
      title: '建立更强的蒸汽系统基础',
      description: '从蒸汽品质、输送到冷凝水管理，系统理解蒸汽回路各环节如何协同工作。',
      imageSrc: '/uploads/images/202606/page-heroes/col-329-learn-about-steam-header_training_198-a035a6ecd6.jpg',
      href: '/promo/benefits-of-steam/',
      label: '发现更多'
    },
    {
      kicker: '节能',
      title: '节能与热回收机会',
      description: '识别减少损失、回收热量和提升工厂整体效率的切入点，同时兼顾系统稳定运行。',
      imageSrc: '/uploads/images/202606/boilerhouse_01-0d6d9e8d4f.jpg',
      href: '/promo/key-energy-saving-tips/',
      label: '查看节能建议'
    },
    {
      kicker: 'Flowmetering solutions',
      title: '让流量数据服务于更好的决策',
      description: '通过更好的测量能力验证需求、改善控制效果，并支撑更可靠的系统决策。',
      imageSrc: '/uploads/images/202606/flowmetering_02-7e67646194.jpg',
      href: '/promo/flowmetering-solutions/',
      label: '发现更多'
    },
    {
      kicker: '疏水阀无线监测',
      title: '让关键蒸汽资产持续可见并可控',
      description: '结合可维护的硬件、监测能力与专业服务支持，帮助您提升关键蒸汽资产的可视性与可靠性。',
      imageSrc: '/uploads/images/202606/page-heroes/col-70-services-header_services-landing-2615902fa9.jpg',
      href: '/services/wireless-steam-trap-monitoring/',
      label: '发现更多'
    }
  ],
  contactCallout: {
    backgroundImage: '/uploads/images/202606/page-heroes/col-87-contact-contact-us-background-a13bcb7af3.jpg',
    title: 'Spirax Sarco 斯派莎克蒸汽系统专业支持',
    subtitle: '无论您需要产品建议、项目支持还是本地销售联系路径，Spirax Sarco 斯派莎克团队都将帮助您找到合适的解决方案。',
    contactLabel: '联系中国公司',
    contactHref: '/contact-us/',
    contactSecondaryLabel: '了解斯派莎克',
    contactSecondaryHref: '/about-us/'
  },
  industriesTitle: '围绕行业场景构建蒸汽系统解决方案',
  industries: [
    {
      title: '酿造和蒸馏行业',
      imageSrc: '/uploads/images/202606/page-heroes/col-94-industries-brewing-and-distilling.jpg',
      href: '/industries/brewing-and-distilling/'
    },
    {
      title: '食品与饮料行业',
      imageSrc: '/uploads/images/202606/page-heroes/col-94-industries-food-and-beverage.jpg',
      href: '/industries/food-and-beverage/'
    },
    {
      title: '医院',
      imageSrc: '/uploads/images/202606/page-heroes/col-94-industries-hospitals.jpg',
      href: '/industries/hospitals/'
    },
    {
      title: '石化行业',
      imageSrc: '/uploads/images/202606/page-heroes/col-94-industries-oil-and-gas.jpg',
      href: '/industries/oil-and-gas/'
    },
    {
      title: '制药',
      imageSrc: '/uploads/images/202606/page-heroes/col-94-industries-pharmaceutical.avif',
      href: '/industries/pharmaceutical/'
    },
    {
      title: '原始设备制造商(OEM)蒸汽解决方案',
      imageSrc: '/uploads/images/202606/page-heroes/col-94-industries-oem.avif',
      href: '/industries/oem/'
    }
  ]
};

const SITE_UI_EN = {
  ui: {
    nav: {
      utilityAriaLabel: 'Utility navigation',
      mainAriaLabel: 'Main navigation',
      searchAriaLabel: 'Open search',
      searchTitle: 'Open search',
      menuAriaLabel: 'Menu',
      contactLabel: 'Contact us',
      contactHref: '/contact-us/'
    },
    search: {
      cancelLabel: 'Cancel',
      clearLabel: 'Clear search',
      closeLabel: 'Close search',
      emptyBody: 'No matching content was found. Try a different keyword.',
      emptyTitle: 'No results found',
      loadingLabel: 'Searching...',
      placeholder: 'Search products, articles or solutions',
      resultsLabel: 'Site search results',
      unavailableBody: 'Search is currently unavailable. Please try again later.',
      unavailableTitle: 'Search unavailable'
    },
    breadcrumb: {
      ariaLabel: 'Breadcrumb navigation',
      homeLabel: 'Home',
      homeHref: '/'
    }
  }
};

const SITE_UI_ZH = {
  ui: {
    nav: {
      utilityAriaLabel: '辅助导航',
      mainAriaLabel: '主导航',
      searchAriaLabel: '打开搜索',
      searchTitle: '打开搜索',
      menuAriaLabel: '菜单',
      contactLabel: '联系我们',
      contactHref: '/contact-us/'
    },
    search: {
      cancelLabel: '取消',
      clearLabel: '清空搜索',
      closeLabel: '关闭搜索',
      emptyBody: '未找到匹配内容，请尝试其他关键词。',
      emptyTitle: '未找到结果',
      loadingLabel: '搜索中...',
      placeholder: '搜索产品、文章或解决方案',
      resultsLabel: '站内搜索结果',
      unavailableBody: '搜索服务暂时不可用，请稍后再试。',
      unavailableTitle: '搜索不可用'
    },
    breadcrumb: {
      ariaLabel: '面包屑导航',
      homeLabel: '首页',
      homeHref: '/'
    }
  }
};

const TEMPLATE_UPDATES = [
  { code: 'home', source: HOME_TEMPLATE_SOURCE },
  { code: 'site_nav', source: SITE_NAV_TEMPLATE_SOURCE },
  { code: 'global_search', source: GLOBAL_SEARCH_TEMPLATE_SOURCE },
  { code: 'breadcrumbs', source: BREADCRUMBS_TEMPLATE_SOURCE },
  { code: 'shell', source: SHELL_TEMPLATE_SOURCE }
];

for (const template of TEMPLATE_UPDATES) {
  execute(
    `
      UPDATE templates
      SET tsx_source = ?, published_tsx_source = ?, updated_at = ?
      WHERE code = ?
    `,
    [template.source, template.source, now, template.code]
  );
}

execute(
  `
    UPDATE column_translations
    SET template_data_json = ?, updated_at = ?
    WHERE column_id = 117 AND language_id = ?
  `,
  [JSON.stringify(HOME_DATA_EN), now, EN_LANGUAGE_ID]
);

execute(
  `
    INSERT INTO column_translations (
      column_id,
      language_id,
      name,
      summary,
      content_html,
      template_data_json,
      publish_status,
      created_at,
      updated_at
    )
    VALUES (
      117,
      ?,
      '首页',
      '',
      '',
      ?,
      'published',
      ?,
      ?
    )
    ON CONFLICT(column_id, language_id) DO UPDATE SET
      template_data_json = excluded.template_data_json,
      updated_at = excluded.updated_at
  `,
  [ZH_LANGUAGE_ID, JSON.stringify(HOME_DATA_ZH), now, now]
);

for (const [languageId, payload] of [
  [EN_LANGUAGE_ID, SITE_UI_EN],
  [ZH_LANGUAGE_ID, SITE_UI_ZH]
]) {
  execute(
    `
      UPDATE site_config_translations
      SET template_data_json = ?, updated_at = ?
      WHERE site_config_id = 1 AND language_id = ?
    `,
    [JSON.stringify(payload), now, languageId]
  );
}

console.log('Localized homepage and shared UI templates refreshed.');
