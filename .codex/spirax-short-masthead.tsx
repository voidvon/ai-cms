import React from 'react';

export const scss = String.raw`
.sg-short-masthead {
  --sg-short-masthead-min-height: 228px;
  --sg-short-masthead-mobile-min-height: 228px;
  --sg-short-masthead-content-max-width: 760px;
  --sg-short-masthead-content-padding: 38px 0;
  --sg-short-masthead-overlay:
    linear-gradient(
      90deg,
      rgba(0, 45, 114, 0.94) 0%,
      rgba(0, 79, 153, 0.78) 50%,
      rgba(0, 45, 114, 0.94) 100%
    );
  --sg-short-masthead-image-opacity: 0.34;
  position: relative;
  display: flex;
  min-height: var(--sg-short-masthead-min-height);
  overflow: hidden;
  color: #fff;
  background: var(--sg-blue);
}

.sg-short-masthead--hero {
  --sg-short-masthead-min-height: 400px;
  --sg-short-masthead-mobile-min-height: 320px;
  --sg-short-masthead-content-max-width: 650px;
  --sg-short-masthead-content-padding: 48px 0;
}

.sg-short-masthead__image {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  opacity: var(--sg-short-masthead-image-opacity);
}

.sg-short-masthead__overlay {
  position: absolute;
  inset: 0;
  z-index: 1;
  background: var(--sg-short-masthead-overlay);
  pointer-events: none;
}

.sg-short-masthead__text {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  width: min(var(--sg-page-max-width), calc(100% - 40px));
  min-height: var(--sg-short-masthead-min-height);
  margin: 0 auto;
  padding: var(--sg-short-masthead-content-padding);
}

.sg-short-masthead__body {
  max-width: var(--sg-short-masthead-content-max-width);
}

.sg-short-masthead__eyebrow {
  margin: 0 0 10px;
  color: rgba(255, 255, 255, 0.92);
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.08em;
  line-height: 1.35;
  text-transform: uppercase;
}

.sg-short-masthead__heading {
  margin: 0;
  color: #fff;
}

.sg-short-masthead__summary {
  margin: 18px 0 0;
  color: #fff;
  font-size: 16px;
  font-weight: 700;
  line-height: 1.4;
}

.sg-short-masthead--with-image {
  --sg-short-masthead-overlay:
    linear-gradient(
      90deg,
      rgba(0, 45, 114, 0.82) 0%,
      rgba(0, 79, 153, 0.62) 50%,
      rgba(0, 45, 114, 0.82) 100%
    );
  --sg-short-masthead-image-opacity: 0.62;
}

@media (max-width: 1050px) {
  .sg-short-masthead,
  .sg-short-masthead__text {
    min-height: var(--sg-short-masthead-mobile-min-height);
  }

  .sg-short-masthead[data-mobile-align='center'] .sg-short-masthead__text {
    justify-content: center;
  }

  .sg-short-masthead[data-mobile-align='center'] .sg-short-masthead__body,
  .sg-short-masthead[data-mobile-align='center'] .sg-short-masthead__heading,
  .sg-short-masthead[data-mobile-align='center'] .sg-short-masthead__summary,
  .sg-short-masthead[data-mobile-align='center'] .sg-short-masthead__eyebrow {
    text-align: center;
  }
}
`;

export default function Component(props) {
  const {
    align = 'left',
    className = '',
    eyebrow = '',
    eyebrowClassName = '',
    headingClassName = '',
    image = '',
    imageAlt = '',
    mobileAlign = 'center',
    overlayStyle,
    size = 'short',
    summary = '',
    summaryClassName = '',
    title = ''
  } = props || {};
  const hasImage = Boolean(image);

  return (
    <header
      className={[
        'sg-short-masthead',
        `sg-short-masthead--${size}`,
        hasImage ? 'sg-short-masthead--with-image' : '',
        className || ''
      ].filter(Boolean).join(' ')}
      data-align={align}
      data-mobile-align={mobileAlign}
      data-size={size}
    >
      {hasImage ? (
        <img
          alt={imageAlt || title || ''}
          aria-hidden="true"
          className="sg-short-masthead__image"
          fetchPriority="high"
          loading="eager"
          src={image}
        />
      ) : null}
      <div aria-hidden="true" className="sg-short-masthead__overlay" style={overlayStyle}></div>
      <div className="sg-short-masthead__text">
        <div className="sg-short-masthead__body">
          {eyebrow ? (
            <p className={['sg-short-masthead__eyebrow', eyebrowClassName].filter(Boolean).join(' ')}>
              {eyebrow}
            </p>
          ) : null}
          {title ? (
            <h1 className={['sg-short-masthead__heading', 'masthead__heading', headingClassName].filter(Boolean).join(' ')}>
              {title}
            </h1>
          ) : null}
          {summary ? (
            <p className={['sg-short-masthead__summary', summaryClassName].filter(Boolean).join(' ')}>
              {summary}
            </p>
          ) : null}
        </div>
      </div>
    </header>
  );
}
