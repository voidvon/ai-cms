import React from 'react';

const PHONE_ICON_PATH = 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.81.33 1.6.61 2.36a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.12-1.12a2 2 0 0 1 2.11-.45c.76.28 1.55.49 2.36.61A2 2 0 0 1 22 16.92z';

const CONTACT_ICON_SPRITE = `
<svg aria-hidden="true" class="sg-contact-page__icon-sprite" viewBox="0 0 0 0">
  <symbol id="sg-contact-icon-telegram" viewBox="0 0 1024 1024">
    <path d="M512 1024c282.769408 0 512-229.230592 512-512S794.769408 0 512 0 0 229.230592 0 512s229.230592 512 512 512z" fill="#5aa8e1"></path>
    <path d="M213.088256 507.559936s256-105.0624 344.784896-142.057472c34.035712-14.7968 149.456896-62.150656 149.456896-62.150656s53.272576-20.71552 48.832512 29.595648c-1.480704 20.717568-13.318144 93.22496-25.155584 171.65312-17.758208 110.983168-36.995072 232.323072-36.995072 232.323072s-2.95936 34.035712-28.114944 39.954432-66.59072-20.71552-73.988096-26.636288c-5.920768-4.438016-110.983168-71.028736-149.456896-103.583744-10.358784-8.87808-22.196224-26.63424 1.478656-47.351808 53.272576-48.832512 116.901888-109.502464 155.375616-147.976192 17.758208-17.758208 35.514368-59.191296-38.473728-8.880128-105.0624 72.50944-208.646144 140.578816-208.646144 140.578816s-23.676928 14.7968-68.069376 1.478656c-44.394496-13.316096-96.186368-31.074304-96.186368-31.074304s-35.51232-22.196224 25.157632-45.873152z" fill="#FFFFFF"></path>
  </symbol>
  <symbol id="sg-contact-icon-messenger" viewBox="0 0 1024 1024">
    <path d="M512 0.09999C235.31702-5.355477 6.367378 214.055096 0.049995 490.718078a481.358992 481.358992 0 0 0 170.649335 365.190337v146.759668c0 11.78085 9.551067 21.331917 21.331917 21.331917a21.337916 21.337916 0 0 0 11.304896-3.241683l118.900389-74.274747a528.232415 528.232415 0 0 0 189.763468 34.854596c276.68298 5.455467 505.632622-213.955106 511.950005-490.618088C1017.632622 214.055096 788.68298-5.355477 512 0.09999z" fill="#2d65f6"></path>
    <path d="M849.033087 349.931827a21.329917 21.329917 0 0 0-27.303334-5.973417l-221.844336 120.948189-138.012522-118.346443a21.329917 21.329917 0 0 0-28.967171 1.109892l-255.975002 255.975002c-8.305189 8.355184-8.265193 21.861865 0.091991 30.167054a21.329917 21.329917 0 0 0 25.207538 3.621647l221.844335-120.948189 138.14051 118.388439a21.329917 21.329917 0 0 0 28.967171-1.109892l255.975003-255.975002a21.329917 21.329917 0 0 0 1.875817-27.85728z" fill="#FAFAFA"></path>
  </symbol>
  <symbol id="sg-contact-icon-whatsapp" viewBox="0 0 1024 1024">
    <path d="M512 512m-512 0a512 512 0 1 0 1024 0 512 512 0 1 0-1024 0Z" fill="#71da69"></path>
    <path d="M760.2 269.5c-62.1-61.4-144.6-95.2-232.5-95.2-181.1 0-328.5 145.7-328.5 324.8 0 57.2 15.1 113.2 43.9 162.3l-46.6 168.3 174.2-45.2c48.2 25.9 102.1 39.5 157 39.6h0.1c181.1 0 328.6-145.7 328.6-324.8 0.1-86.8-34.1-168.3-96.2-229.8zM527.8 769.3c-49 0-97-13-139.1-37.6l-10-5.9-103.4 26.7 27.6-99.6-6.5-10.2c-27.4-43-42-92.8-41.8-143.6 0-148.9 122.5-270 273.3-270 72.9 0 141.6 28.2 193.2 79.1 51.4 50.6 80.1 119.3 79.9 191-0.1 149-122.6 270.1-273.2 270.1zM677.6 567c-8.2-4.1-48.6-23.7-56.1-26.4-7.5-2.7-13-4.1-18.5 4.1-5.4 8.1-21.2 26.4-26 31.9-4.8 5.4-9.6 6.1-17.7 2.1-8.2-4.1-34.7-12.7-66.1-40.3-24.4-21.5-40.9-48.1-45.7-56.2-4.8-8.1-0.5-12.6 3.6-16.5 3.8-3.6 8.2-9.5 12.3-14.2 4.1-4.7 5.4-8.1 8.2-13.6 2.7-5.4 1.4-10.1-.6-14.2-2.1-4.1-18.5-44-25.3-60.3-6.6-15.9-13.5-13.7-18.5-13.9-4.8-.2-10.2-.2-15.7-.2-5.4 0-14.4 2-21.9 10.1-7.5 8.1-28.7 27.8-28.7 67.7 0 39.9 29.4 78.5 33.6 84 4.1 5.4 57.9 87.4 140.3 122.5 19.6 8.3 34.8 13.3 46.8 17.1 19.7 6.1 37.6 5.2 51.7 3.2 15.8-2.3 48.6-19.6 55.4-38.5 6.9-18.9 6.9-35.2 4.8-38.5-2.1-3.7-7.6-5.8-15.9-9.9z" fill="#FFFFFF"></path>
  </symbol>
  <symbol id="sg-contact-icon-wecom" viewBox="0 0 1024 1024">
    <path d="M337.387283 341.82659c-17.757225 0-35.514451 11.83815-35.514451 29.595375s17.757225 29.595376 35.514451 29.595376 29.595376-11.83815 29.595376-29.595376c0-18.49711-11.83815-29.595376-29.595376-29.595375zM577.849711 513.479769c-11.83815 0-22.936416 12.578035-22.936416 23.6763 0 12.578035 11.83815 23.676301 22.936416 23.676301 17.757225 0 29.595376-11.83815 29.595376-23.676301s-11.83815-23.676301-29.595376-23.6763zM501.641618 401.017341c17.757225 0 29.595376-12.578035 29.595376-29.595376 0-17.757225-11.83815-29.595376-29.595376-29.595375s-35.514451 11.83815-35.51445 29.595375 17.757225 29.595376 35.51445 29.595376zM706.589595 513.479769c-11.83815 0-22.936416 12.578035-22.936416 23.6763 0 12.578035 11.83815 23.676301 22.936416 23.676301 17.757225 0 29.595376-11.83815 29.595376-23.676301s-11.83815-23.676301-29.595376-23.6763z" fill="#28C445"></path>
    <path d="M510.520231 2.959538C228.624277 2.959538 0 231.583815 0 513.479769s228.624277 510.520231 510.520231 510.520231 510.520231-228.624277 510.520231-510.520231-228.624277-510.520231-510.520231-510.520231zM413.595376 644.439306c-29.595376 0-53.271676-5.919075-81.387284-12.578034l-81.387283 41.433526 22.936416-71.768786c-58.450867-41.433526-93.965318-95.445087-93.965317-159.815029 0-113.202312 105.803468-201.988439 233.803468-201.98844 114.682081 0 216.046243 71.028902 236.023121 166.473989-7.398844-.739884-14.797688-1.479769-22.196532-1.479769-110.982659 1.479769-198.289017 85.086705-198.289017 188.67052 0 17.017341 2.959538 33.294798 7.398844 49.572255-7.398844.739884-15.537572 1.479769-22.936416 1.479768zm346.265896 82.867052 17.757225 59.190752-63.630058-35.514451c-22.936416 5.919075-46.612717 11.83815-70.289017 11.83815-111.722543 0-199.768786-76.947977-199.768786-172.393063-.739884-94.705202 87.306358-171.653179 198.289017-171.65318 105.803468 0 199.028902 77.687861 199.028902 172.393064 0 53.271676-34.774566 100.624277-81.387283 136.138728z" fill="#28C445"></path>
  </symbol>
</svg>
`;

const TOAST_SCRIPT = `
(() => {
  if (typeof window === 'undefined' || window.__sgUiToastBound) return;
  window.__sgUiToastBound = true;
  const toastSelector = '[data-sg-ui-toast]';
  const textSelector = '[data-sg-ui-toast-text]';
  const openClassName = 'is-open';
  const defaultDuration = 2200;
  let activeToast = null;
  let closeTimer = null;
  function getToast() {
    return document.querySelector(toastSelector);
  }
  function hideToast() {
    const toast = getToast();
    if (!(toast instanceof HTMLElement)) return;
    toast.classList.remove(openClassName);
    window.setTimeout(() => {
      if (!toast.classList.contains(openClassName)) toast.hidden = true;
    }, 220);
  }
  function showToast(detail) {
    const toast = getToast();
    if (!(toast instanceof HTMLElement)) return;
    const textNode = toast.querySelector(textSelector);
    if (!(textNode instanceof HTMLElement)) return;
    const text = typeof detail?.text === 'string' ? detail.text.trim() : '';
    if (!text) return;
    if (closeTimer) window.clearTimeout(closeTimer);
    activeToast = toast;
    textNode.textContent = text;
    toast.hidden = false;
    toast.offsetWidth;
    toast.classList.add(openClassName);
    const durationValue = Number(detail?.duration ?? toast.dataset.sgUiToastDuration);
    const duration = Number.isFinite(durationValue) ? durationValue : defaultDuration;
    closeTimer = window.setTimeout(() => {
      if (activeToast === toast) {
        hideToast();
        activeToast = null;
      }
    }, duration);
  }
  window.sgUiToast = { hide: hideToast, show: showToast };
  window.addEventListener('sg-ui-toast:show', (event) => {
    showToast(event.detail);
  });
})();
`;

const DIALOG_SCRIPT = `
(() => {
  if (typeof window === 'undefined' || window.__sgUiDialogBound) return;
  window.__sgUiDialogBound = true;
  const dialogSelector = '[data-sg-ui-dialog]';
  const openClassName = 'is-open';
  const bodyOpenClassName = 'sg-ui-dialog-open';
  const mobileQuery = window.matchMedia('(max-width: 640px)');
  const transitionDurationMs = 180;
  const closeTimers = new WeakMap();
  function getDialogs() {
    return Array.from(document.querySelectorAll(dialogSelector));
  }
  function isMobileOnly(dialog) {
    return dialog?.dataset.sgUiDialogMobileOnly === 'true';
  }
  function isEnabled(dialog) {
    return !isMobileOnly(dialog) || mobileQuery.matches;
  }
  function getTrigger(dialog) {
    return dialog?.querySelector('[data-sg-ui-dialog-trigger]');
  }
  function getRoot(dialog) {
    return dialog?.querySelector('[data-sg-ui-dialog-root]');
  }
  function syncBodyState() {
    const hasOpenDialog = getDialogs().some((dialog) => dialog.classList.contains(openClassName));
    document.body.classList.toggle(bodyOpenClassName, hasOpenDialog);
  }
  function clearCloseTimer(dialog) {
    const timerId = closeTimers.get(dialog);
    if (timerId) {
      window.clearTimeout(timerId);
      closeTimers.delete(dialog);
    }
  }
  function closeDialog(dialog, restoreFocus = false) {
    if (!(dialog instanceof HTMLElement)) return;
    const root = getRoot(dialog);
    const trigger = getTrigger(dialog);
    clearCloseTimer(dialog);
    dialog.classList.remove(openClassName);
    if (trigger instanceof HTMLElement) {
      trigger.setAttribute('aria-expanded', 'false');
      if (restoreFocus) trigger.focus();
    }
    if (root instanceof HTMLElement) {
      const timerId = window.setTimeout(() => {
        root.hidden = true;
        closeTimers.delete(dialog);
      }, transitionDurationMs);
      closeTimers.set(dialog, timerId);
    }
  }
  function closeAllDialogs(restoreFocus = false) {
    const dialogs = getDialogs();
    const activeDialog = dialogs.find((dialog) => dialog.classList.contains(openClassName));
    dialogs.forEach((dialog) => closeDialog(dialog, restoreFocus && dialog === activeDialog));
    syncBodyState();
  }
  function openDialog(dialog) {
    if (!(dialog instanceof HTMLElement) || !isEnabled(dialog)) return;
    getDialogs().forEach((item) => {
      if (item !== dialog) closeDialog(item);
    });
    const root = getRoot(dialog);
    const trigger = getTrigger(dialog);
    clearCloseTimer(dialog);
    if (root instanceof HTMLElement) {
      root.hidden = false;
      root.offsetWidth;
    }
    if (trigger instanceof HTMLElement) trigger.setAttribute('aria-expanded', 'true');
    syncBodyState();
    window.requestAnimationFrame(() => {
      dialog.classList.add(openClassName);
      const closeButton = dialog.querySelector('.sg-ui-dialog__close');
      if (closeButton instanceof HTMLElement) closeButton.focus();
    });
  }
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const trigger = target.closest('[data-sg-ui-dialog-trigger]');
    if (trigger instanceof HTMLElement) {
      const dialog = trigger.closest(dialogSelector);
      if (!(dialog instanceof HTMLElement) || !isEnabled(dialog)) return;
      event.preventDefault();
      if (dialog.classList.contains(openClassName)) {
        closeDialog(dialog, true);
        syncBodyState();
        return;
      }
      openDialog(dialog);
      return;
    }
    const copyButton = target.closest('[data-sg-ui-dialog-copy-text]');
    if (copyButton instanceof HTMLElement) {
      const copyText = copyButton.getAttribute('data-sg-ui-dialog-copy-text');
      const toastText = copyButton.getAttribute('data-sg-ui-dialog-copy-toast-text');
      const shouldClose = copyButton.getAttribute('data-sg-ui-dialog-action-close') === 'true';
      const dialog = copyButton.closest(dialogSelector);
      if (!copyText) return;
      event.preventDefault();
      const copy = async () => {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(copyText);
          return;
        }
        const textArea = document.createElement('textarea');
        textArea.value = copyText;
        textArea.setAttribute('readonly', '');
        textArea.style.position = 'absolute';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      };
      copy().then(() => {
        if (toastText) {
          window.dispatchEvent(new CustomEvent('sg-ui-toast:show', { detail: { text: toastText } }));
        }
        if (shouldClose) {
          closeDialog(dialog, true);
          syncBodyState();
        }
      }).catch(() => {});
      return;
    }
    const actionCloseButton = target.closest('[data-sg-ui-dialog-action-close=\"true\"]');
    if (actionCloseButton instanceof HTMLElement) {
      const dialog = actionCloseButton.closest(dialogSelector);
      if (!(actionCloseButton instanceof HTMLAnchorElement)) event.preventDefault();
      closeDialog(dialog, true);
      syncBodyState();
      return;
    }
    const closeButton = target.closest('[data-sg-ui-dialog-close]');
    if (closeButton instanceof HTMLElement) {
      const dialog = closeButton.closest(dialogSelector);
      event.preventDefault();
      closeDialog(dialog, true);
      syncBodyState();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeAllDialogs(true);
    }
  });
  const handleViewportChange = (event) => {
    if (!event.matches) {
      getDialogs().filter((dialog) => isMobileOnly(dialog)).forEach((dialog) => closeDialog(dialog));
      syncBodyState();
    }
  };
  if (typeof mobileQuery.addEventListener === 'function') mobileQuery.addEventListener('change', handleViewportChange);
  else if (typeof mobileQuery.addListener === 'function') mobileQuery.addListener(handleViewportChange);
})();
`;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeLinkItems(value) {
  return asArray(value).filter((item) => item && (text(item.label) || text(item.href)));
}

function normalizePhones(card) {
  if (normalizeLinkItems(card?.phoneLinks).length) return normalizeLinkItems(card.phoneLinks);
  const phone = text(card?.phone);
  if (!phone) return [];
  return [{ label: phone, href: `tel:${phone.replace(/[^\d+]/g, '')}` }];
}

function normalizeEmails(card) {
  if (normalizeLinkItems(card?.emailLinks).length) return normalizeLinkItems(card.emailLinks);
  const email = text(card?.email);
  if (!email) return [];
  return [{ label: email, href: `mailto:${email}` }];
}

function normalizeInstantContacts(card) {
  return asArray(card?.instantContacts).filter((item) => text(item?.type) && (text(item?.label) || text(item?.href) || text(item?.value)));
}

function normalizeSupportHighlights(value) {
  return asArray(value).filter((item) => text(item?.icon) || text(item?.title) || text(item?.body));
}

function renderRawHtml(html) {
  if (!html) return null;
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

function renderScript(source) {
  if (!source) return null;
  return <script dangerouslySetInnerHTML={{ __html: source }} />;
}

function buildDialogId(prefix, officeIndex, contactIndex) {
  return `${prefix}-${officeIndex}-${contactIndex}`;
}

function InstantContactItem({ item, officeIndex, contactIndex, labels }) {
  const type = text(item?.type).toLowerCase();
  const label = text(item?.label || item?.value);
  const href = text(item?.href);
  const value = text(item?.value);
  const qrImage = text(item?.qrImage);
  const qrAlt = text(item?.qrAlt || label);
  const copyValue = text(item?.copyValue || value);
  const dialogTitle = text(item?.dialogTitle || label);
  const toastLabel = text(item?.copyToastLabel || labels.copyToastLabel);
  const detail = text(item?.detail || value);

  if (!type || !label) return null;

  const iconName = type === 'wechat' ? 'wecom' : type;
  const symbolHref = `#sg-contact-icon-${iconName}`;
  const isDialogOnly = type === 'wechat' || type === 'wecom' || Boolean(qrImage) || Boolean(copyValue && !href);
  const dialogId = buildDialogId('sg-ui-dialog', officeIndex, contactIndex);

  const trigger = (
    <span className="sg-instant-contact__action">
      <span className="sg-instant-contact__icon">
        <svg aria-hidden="true" className="sg-instant-contact__symbol" viewBox="0 0 1024 1024">
          <use href={symbolHref}></use>
        </svg>
      </span>
      <span className="sg-instant-contact__label">{label}</span>
    </span>
  );

  if (!isDialogOnly && href) {
    return (
      <a className="sg-instant-contact__action" href={href}>
        <span className="sg-instant-contact__icon">
          <svg aria-hidden="true" className="sg-instant-contact__symbol" viewBox="0 0 1024 1024">
            <use href={symbolHref}></use>
          </svg>
        </span>
        <span className="sg-instant-contact__label">{label}</span>
      </a>
    );
  }

  return (
    <div className={['sg-instant-contact__action-wrap', type === 'wecom' ? 'sg-instant-contact__action-wrap--wecom' : ''].filter(Boolean).join(' ')} data-sg-ui-dialog data-sg-ui-dialog-mobile-only="true" id={dialogId}>
      <button
        aria-expanded="false"
        className="sg-ui-dialog__trigger sg-instant-contact__action sg-instant-contact__action--mobile-only"
        data-sg-ui-dialog-trigger
        type="button"
      >
        {trigger}
      </button>
      <div className="sg-ui-tooltip sg-ui-tooltip--top sg-instant-contact__action--desktop-only">
        <button className="sg-ui-tooltip__trigger" type="button">
          {trigger}
        </button>
        <div className="sg-ui-tooltip__content">
          <div className="sg-instant-contact__popover">
            <div className={['sg-instant-contact__panel-content', qrImage ? 'sg-instant-contact__panel-content--with-qr' : ''].filter(Boolean).join(' ')}>
              {qrImage ? <img alt={qrAlt} className="sg-instant-contact__qr-image" src={qrImage} /> : <div className="sg-instant-contact__qr-placeholder">{detail || label}</div>}
              {detail ? <p className="sg-instant-contact__panel-detail">{detail}</p> : null}
            </div>
          </div>
        </div>
      </div>
      <div className="sg-ui-dialog__root" data-sg-ui-dialog-root hidden>
        <button aria-label={labels.closeLabel} className="sg-ui-dialog__backdrop" data-sg-ui-dialog-close type="button"></button>
        <div className="sg-ui-dialog__panel sg-ui-dialog__panel--sm" role="dialog" aria-modal="true" aria-labelledby={`${dialogId}-title`}>
          <div className="sg-ui-dialog__header">
            <h3 className="sg-ui-dialog__title" id={`${dialogId}-title`}>{dialogTitle}</h3>
            <button aria-label={labels.closeLabel} className="sg-ui-dialog__close" data-sg-ui-dialog-close type="button">×</button>
          </div>
          <div className="sg-ui-dialog__body">
            <div className={['sg-instant-contact__panel-content', qrImage ? 'sg-instant-contact__panel-content--with-qr' : ''].filter(Boolean).join(' ')}>
              {qrImage ? <img alt={qrAlt} className="sg-instant-contact__qr-image" src={qrImage} /> : <div className="sg-instant-contact__qr-placeholder">{detail || label}</div>}
              {detail ? <p className="sg-instant-contact__panel-detail">{detail}</p> : null}
            </div>
          </div>
          <div className="sg-ui-dialog__footer">
            <div className={['sg-ui-dialog__footer-actions', copyValue ? 'sg-ui-dialog__footer-actions--double' : ''].filter(Boolean).join(' ')}>
              {copyValue ? (
                <button
                  className="sg-ui-ios-button sg-ui-ios-button--secondary sg-ui-dialog__footer-action"
                  data-sg-ui-dialog-copy-text={copyValue}
                  data-sg-ui-dialog-copy-toast-text={toastLabel}
                  type="button"
                >
                  {labels.copyLabel}
                </button>
              ) : null}
              {href ? (
                <a className="sg-ui-ios-button sg-ui-ios-button--primary sg-ui-dialog__footer-action" data-sg-ui-dialog-action-close="true" href={href}>
                  {labels.openLabel}
                </a>
              ) : (
                <button className="sg-ui-ios-button sg-ui-ios-button--primary sg-ui-dialog__footer-action" data-sg-ui-dialog-close type="button">
                  {labels.closeLabel}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function OfficeCard({ card, labels, officeIndex }) {
  const phoneLinks = normalizePhones(card);
  const emailLinks = normalizeEmails(card);
  const instantContacts = normalizeInstantContacts(card);

  return (
    <article className="sg-contact-highlight sg-contact-page__sidebar-office">
      <span aria-hidden="true" className="sg-contact-highlight__icon sg-contact-highlight__icon--glyph">
        <svg fill="none" viewBox="0 0 24 24">
          <path d={PHONE_ICON_PATH} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8"></path>
        </svg>
      </span>
      <div className="sg-contact-highlight__body">
        {text(card?.title) ? <strong>{card.title}</strong> : null}
        {text(card?.address) ? (
          <address className="office__address sg-contact-page__sidebar-address sg-contact-page__sidebar-address--single-line">
            <span>{card.address}</span>
          </address>
        ) : null}
        <div className="office__contact sg-contact-page__sidebar-contact">
          {(phoneLinks.length || emailLinks.length) ? (
            <p>
              {phoneLinks.length ? (
                <>
                  {text(card?.phoneLabel || labels.phoneLabel)}:{' '}
                  {phoneLinks.map((item, index) => (
                    <React.Fragment key={`phone-${index}`}>
                      {index > 0 ? ' / ' : null}
                      <a href={text(item.href)}>{text(item.label)}</a>
                    </React.Fragment>
                  ))}
                </>
              ) : null}
              {phoneLinks.length && emailLinks.length ? <br /> : null}
              {emailLinks.length ? (
                <>
                  {text(card?.emailLabel || labels.emailLabel)}:{' '}
                  {emailLinks.map((item, index) => (
                    <React.Fragment key={`email-${index}`}>
                      {index > 0 ? ' / ' : null}
                      <a className="u-break-word" href={text(item.href)}>{text(item.label)}</a>
                    </React.Fragment>
                  ))}
                </>
              ) : null}
            </p>
          ) : null}
          {text(card?.secondaryAddress) ? <div className="sg-contact-page__secondary-address">{card.secondaryAddress}</div> : null}
          {instantContacts.length ? (
            <div className="sg-instant-contact sg-contact-page__inline-instant-contact">
              <div dangerouslySetInnerHTML={{ __html: CONTACT_ICON_SPRITE }} />
              <div className="sg-instant-contact__actions sg-instant-contact__actions--compact">
                {instantContacts.map((item, index) => (
                  <InstantContactItem
                    contactIndex={index}
                    item={item}
                    key={index}
                    labels={labels}
                    officeIndex={officeIndex}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function SupportHighlightCard({ item }) {
  const icon = text(item?.icon);
  const alt = text(item?.alt);
  const title = text(item?.title);
  const body = text(item?.body);

  if (!icon && !title && !body) return null;

  return (
    <article className="sg-contact-highlight">
      {icon ? <img alt={alt} className="sg-contact-highlight__icon" src={icon} /> : null}
      <div className="sg-contact-highlight__body">
        {title ? <strong>{title}</strong> : null}
        {body ? <p>{body}</p> : null}
      </div>
    </article>
  );
}

function Toast() {
  return (
    <>
      <div className="sg-ui-toast sg-ui-toast--center" data-sg-ui-toast data-sg-ui-toast-duration="2200" hidden role="status" aria-live="polite">
        <div className="sg-ui-toast__surface">
          <p className="sg-ui-toast__text" data-sg-ui-toast-text></p>
        </div>
      </div>
      {renderScript(TOAST_SCRIPT)}
    </>
  );
}

export default function Template(props) {
  const shell = props.component('spirax_shell', props);
  const data = props.templateData || {};
  const labels = {
    phoneLabel: text(data.phoneLabel),
    emailLabel: text(data.emailLabel),
    closeLabel: text(data.dialogCloseLabel),
    copyLabel: text(data.dialogCopyLabel),
    copyToastLabel: text(data.dialogCopiedToastLabel),
    openLabel: text(data.dialogOpenLabel),
  };
  const title = text(data.pageTitle || props.title);
  const heroSummary = text(data.heroSummary);
  const heroImage = text(data.heroImage);
  const sectionTitle = text(data.sectionTitle);
  const officeCards = asArray(data.officeCards).filter(Boolean);
  const supportHighlights = normalizeSupportHighlights(data.supportHighlights);
  const appendixHtml = text(data.appendixHtml);

  const content = (
    <main className="sg-page-shell sg-content-shell sg-contact-page">
      <Toast />
      {renderScript(DIALOG_SCRIPT)}
      {props.component('spirax_short_masthead', {
        title,
        summary: heroSummary,
        image: heroImage,
        imageAlt: title,
        className: 'short-masthead'
      })}

      <section className="bg--light-blue">
        {sectionTitle ? (
          <div className="section-header">
            <h2 className="section-header__title">{sectionTitle}</h2>
          </div>
        ) : null}
        <div className="sg-contact-page__content-shell">
          <div className="grid sg-contact-page__grid--single-column">
            <div className="sg-contact-page__contact-column">
              <section className="bg--white">
                <div className="sg-contact-page__sidebar-shell">
                  <div className="sg-contact-page__sidebar-copy">
                    {officeCards.map((card, index) => (
                      <OfficeCard card={card} key={index} labels={labels} officeIndex={index} />
                    ))}
                    {supportHighlights.map((item, index) => (
                      <SupportHighlightCard item={item} key={`support-${index}`} />
                    ))}
                    {appendixHtml ? renderRawHtml(appendixHtml) : null}
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </section>
    </main>
  );

  return shell ? React.cloneElement(shell, {}, content) : content;
}

export const scss = `
.sg-contact-page {
  background: #fff;
  color: var(--sg-color-text);
}

.sg-contact-page .section-header {
  padding-top: 54px;
  padding-bottom: 0;
}

.sg-contact-page .section-header__title {
  position: relative;
  display: inline-block;
  line-height: 1.08;
}

.sg-contact-page .section-header__title::after {
  position: absolute;
  bottom: -24px;
  left: 50%;
  width: 90px;
  height: 5px;
  margin-left: -45px;
  background: var(--sg-color-blue-accent);
  content: "";
}

.sg-contact-page .grid {
  display: grid;
  gap: 30px;
  align-items: start;
}

.sg-contact-page .sg-contact-page__content-shell,
.sg-contact-page .sg-contact-page__sidebar-shell {
  width: min(var(--sg-page-max-width), calc(100% - 40px));
  margin: 0 auto;
  padding-top: 54px;
  padding-bottom: 54px;
}

.sg-contact-page .sg-contact-page__sidebar-shell {
  max-width: 900px;
}

.sg-contact-page .sg-contact-page__contact-column {
  min-width: 0;
}

.sg-contact-page .sg-contact-page__sidebar-copy {
  max-width: none;
  margin: 0;
  color: inherit;
  font-size: 16px;
  line-height: 1.6;
  text-align: left;
}

.sg-contact-page .sg-contact-highlight + .sg-contact-highlight {
  margin-top: 34px;
  padding-top: 34px;
  border-top: 1px solid var(--sg-color-border);
}

.sg-contact-page .sg-contact-page__sidebar-office {
  margin-bottom: 0;
}

.sg-contact-page .sg-contact-page__sidebar-office + .sg-contact-highlight {
  padding-top: 34px;
  border-top: 1px solid var(--sg-color-border);
}

.sg-contact-page .sg-contact-page__inline-instant-contact {
  max-width: 270px;
  margin-top: 20px;
  margin-inline: auto;
  padding-top: 20px;
  border-top: 1px solid var(--sg-color-border);
}

.sg-contact-page .sg-contact-page__secondary-address {
  margin: 28px 0 0;
  color: #6d8295;
  font-size: 13px;
  line-height: 1.6;
}

.sg-contact-page .sg-contact-highlight {
  display: flex;
  gap: 22px;
  align-items: flex-start;
}

.sg-contact-page .sg-contact-highlight__icon {
  width: 80px;
  height: 80px;
  flex: 0 0 auto;
  object-fit: contain;
}

.sg-contact-page .sg-contact-highlight__icon--glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgba(136, 181, 199, 0.2);
  color: var(--sg-color-primary);
}

.sg-contact-page .sg-contact-highlight__icon--glyph svg {
  width: 40px;
  height: 40px;
}

.sg-contact-page .sg-contact-page__icon-sprite {
  position: absolute;
  width: 0;
  height: 0;
  overflow: hidden;
}

.sg-contact-page .sg-contact-highlight__body {
  width: 100%;
  min-width: 0;
}

.sg-contact-page .sg-contact-highlight__body strong {
  display: block;
  margin-bottom: 12px;
  color: var(--sg-color-primary);
  font-size: 24px;
  font-weight: 600;
  line-height: 1.2;
}

.sg-contact-page .sg-contact-highlight__body p {
  margin: 0;
}

.sg-contact-page .sg-contact-page__sidebar-address {
  margin-top: 0;
}

.sg-contact-page .sg-contact-page__sidebar-address--single-line {
  white-space: nowrap;
}

.sg-contact-page .sg-contact-page__sidebar-contact {
  margin-top: 16px;
}

.sg-contact-page .office__address {
  display: grid;
  gap: 4px;
  margin-top: 18px;
  font-style: normal;
}

.sg-contact-page .office__contact {
  margin-top: 18px;
}

.sg-contact-page .office__contact p {
  margin: 0;
}

.sg-contact-page .office__contact a:not(.sg-ui-ios-button) {
  color: var(--sg-color-primary);
  text-decoration: none;
}

.sg-contact-page .office__contact a:not(.sg-ui-ios-button):hover,
.sg-contact-page .office__contact a:not(.sg-ui-ios-button):focus-visible {
  text-decoration: underline;
}

.sg-contact-page .office__contact a.sg-ui-ios-button--primary,
.sg-contact-page .office__contact a.sg-ui-ios-button--primary:hover,
.sg-contact-page .office__contact a.sg-ui-ios-button--primary:focus-visible {
  color: #fff;
}

.sg-contact-page .office__contact a.sg-ui-ios-button--secondary,
.sg-contact-page .office__contact a.sg-ui-ios-button--secondary:hover,
.sg-contact-page .office__contact a.sg-ui-ios-button--secondary:focus-visible {
  color: rgb(0, 122, 255);
}

.sg-contact-page .u-break-word {
  overflow-wrap: anywhere;
  word-break: break-word;
}

.sg-contact-page .sg-instant-contact {
  display: grid;
  gap: 14px;
}

.sg-contact-page .sg-instant-contact__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.sg-contact-page .sg-instant-contact__actions--compact {
  gap: 12px 18px;
}

.sg-contact-page .sg-instant-contact__action-wrap {
  position: relative;
  display: inline-flex;
}

.sg-contact-page .sg-instant-contact__action-wrap--wecom {
  margin-top: -12px;
  padding-top: 12px;
}

.sg-contact-page .sg-instant-contact__action {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--sg-color-primary);
  line-height: 1;
  text-decoration: none;
  transition: color 160ms ease, opacity 160ms ease;
  cursor: pointer;
  font: inherit;
}

.sg-contact-page .sg-instant-contact__action:hover,
.sg-contact-page .sg-instant-contact__action:focus-visible {
  opacity: 0.78;
  text-decoration: underline;
}

.sg-contact-page .sg-instant-contact__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  flex: 0 0 22px;
}

.sg-contact-page .sg-instant-contact__symbol {
  display: block;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.sg-contact-page .sg-instant-contact__label {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.2;
}

.sg-contact-page .sg-instant-contact__popover {
  display: grid;
  min-width: 180px;
  padding: 12px;
  border: 1px solid rgba(0, 45, 114, 0.12);
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 18px 42px rgba(0, 45, 114, 0.18);
}

.sg-contact-page .sg-instant-contact__panel-content {
  display: grid;
  gap: 10px;
  min-width: 180px;
}

.sg-contact-page .sg-instant-contact__panel-content--with-qr {
  justify-items: center;
}

.sg-contact-page .sg-instant-contact__panel-detail {
  margin: 0;
  color: #29445c;
  font-size: 14px;
  line-height: 1.5;
  text-align: center;
  word-break: break-word;
}

.sg-contact-page .sg-instant-contact__qr-image,
.sg-contact-page .sg-instant-contact__qr-placeholder {
  width: 180px;
  min-height: 180px;
  border-radius: 12px;
}

.sg-contact-page .sg-instant-contact__qr-image {
  display: block;
  object-fit: cover;
}

.sg-contact-page .sg-instant-contact__qr-placeholder {
  display: grid;
  place-items: center;
  padding: 18px;
  background: linear-gradient(135deg, #f3f8fd 0%, #e6eff8 100%);
  color: #486178;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.5;
  text-align: center;
}

.sg-ui-dialog__anchor {
  position: relative;
  display: inline-flex;
}

.sg-ui-dialog__trigger {
  display: inline-flex;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
}

.sg-ui-dialog__root {
  position: fixed;
  inset: 0;
  z-index: 240;
  display: grid;
  place-items: center;
  padding: 24px 16px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 220ms ease;
}

.sg-ui-dialog__root[hidden] {
  display: none;
}

.sg-ui-dialog__backdrop {
  position: absolute;
  inset: 0;
  border: 0;
  background:
    radial-gradient(circle at top, rgba(255, 255, 255, 0.14), transparent 38%),
    rgba(14, 22, 36, 0.38);
}

.sg-ui-dialog__panel {
  position: relative;
  z-index: 1;
  box-sizing: border-box;
  width: min(100%, 410px);
  padding: 18px 18px 16px;
  border: 1px solid rgba(255, 255, 255, 0.48);
  border-radius: 26px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(244, 247, 252, 0.96));
  box-shadow:
    0 24px 56px rgba(18, 28, 46, 0.18),
    inset 0 1px 0 rgba(255, 255, 255, 0.82);
  color: #1f2d3d;
  opacity: 0;
  transform: translateY(14px) scale(0.88);
  transform-origin: center;
  transition: opacity 220ms ease, transform 220ms cubic-bezier(0.2, 0.9, 0.24, 1);
}

.sg-ui-dialog__panel--sm {
  width: min(100%, 336px);
}

.sg-ui-dialog__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.sg-ui-dialog__title {
  flex: 1 1 auto;
  margin: 0;
  color: #0f1724;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.02em;
  text-align: left;
  line-height: 1.25;
}

.sg-ui-dialog__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  min-width: 34px;
  height: 34px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: #d4d9e1;
  color: #4f5d70;
  cursor: pointer;
  font-size: 20px;
  line-height: 1;
}

.sg-ui-dialog__body {
  display: grid;
}

.sg-ui-dialog__footer {
  display: none;
  margin-top: 16px;
}

.sg-ui-dialog__footer-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
}

.sg-ui-dialog__footer-actions--double {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.sg-ui-dialog__footer-action {
  width: 100%;
}

body.sg-ui-dialog-open {
  overflow: hidden;
}

.sg-ui-dialog.is-open .sg-ui-dialog__root {
  opacity: 1;
  pointer-events: auto;
}

.sg-ui-dialog.is-open .sg-ui-dialog__panel {
  opacity: 1;
  transform: translateY(0) scale(1);
}

.sg-ui-ios-button {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-width: 0;
  min-height: 48px;
  padding: 0 16px;
  border: 0;
  border-radius: 999px;
  box-shadow: none;
  font-size: 17px;
  font-weight: 400;
  line-height: 1.2;
  letter-spacing: 0;
  text-decoration: none;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.sg-ui-ios-button--primary {
  background: rgb(0, 122, 255);
  color: #fff;
}

.sg-ui-ios-button--primary:hover,
.sg-ui-ios-button--primary:focus-visible {
  background: rgb(0, 122, 255);
  color: #fff;
  text-decoration: none;
}

.sg-ui-ios-button--secondary {
  background: rgba(0, 122, 255, 0.15);
  color: rgb(0, 122, 255);
}

.sg-ui-ios-button--secondary:hover,
.sg-ui-ios-button--secondary:focus-visible {
  background: rgba(0, 122, 255, 0.15);
  color: rgb(0, 122, 255);
  text-decoration: none;
}

.sg-ui-toast {
  position: fixed;
  inset: 0;
  z-index: 280;
  display: grid;
  padding: 24px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 220ms ease, transform 220ms cubic-bezier(0.2, 0.9, 0.24, 1);
}

.sg-ui-toast[hidden] {
  display: none;
}

.sg-ui-toast--center {
  place-items: center;
}

.sg-ui-toast__surface {
  box-sizing: border-box;
  max-width: min(320px, calc(100vw - 48px));
  padding: 14px 18px;
  border-radius: 32px;
  background: rgba(255, 255, 255, 0.75);
  backdrop-filter: saturate(180%) blur(16px);
  box-shadow:
    inset -1px -1px 0 -0.5px #fff,
    inset 1px 1px 0 -0.5px #fff,
    inset 3px 3px 10px -3px #ddd,
    inset -3px -3px 10px -3px #ddd,
    inset 0 0 5px 1px #fff,
    inset 0 0 0 0.5px rgba(0, 0, 0, 0.25),
    inset 0 0 24px 0 rgba(0, 0, 0, 0.1),
    0 0 25px 0 rgba(0, 0, 0, 0.2);
  color: #111826;
  opacity: 0;
  transform: scale(0.88);
  transition: opacity 220ms ease, transform 220ms cubic-bezier(0.2, 0.9, 0.24, 1);
}

.sg-ui-toast__text {
  margin: 0;
  font-size: 15px;
  font-weight: 500;
  line-height: 1.35;
  text-align: center;
  letter-spacing: -0.01em;
}

.sg-ui-toast.is-open {
  opacity: 1;
}

.sg-ui-toast.is-open .sg-ui-toast__surface {
  opacity: 1;
  transform: scale(1);
}

.sg-ui-tooltip {
  position: relative;
  display: inline-flex;
}

.sg-ui-tooltip__trigger {
  display: inline-flex;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
}

.sg-ui-tooltip__content {
  position: absolute;
  z-index: 20;
  opacity: 0;
  pointer-events: none;
  transition: opacity 160ms ease, transform 160ms ease;
}

.sg-ui-tooltip--top .sg-ui-tooltip__content {
  bottom: 100%;
  left: 50%;
  transform: translate(-50%, -8px);
}

.sg-ui-tooltip:hover .sg-ui-tooltip__content,
.sg-ui-tooltip:focus-within .sg-ui-tooltip__content {
  opacity: 1;
  pointer-events: auto;
}

.sg-ui-tooltip--top:hover .sg-ui-tooltip__content,
.sg-ui-tooltip--top:focus-within .sg-ui-tooltip__content {
  transform: translate(-50%, 0);
}

@media (min-width: 900px) {
  .sg-contact-page .grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .sg-contact-page .sg-contact-page__grid--single-column {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 640px) {
  .sg-contact-page .sg-contact-page__content-shell,
  .sg-contact-page .sg-contact-page__sidebar-shell {
    width: calc(100% - 28px);
    padding-top: 40px;
    padding-bottom: 40px;
  }

  .sg-contact-page .section-header {
    padding-top: 40px;
  }

  .sg-contact-page .sg-contact-page__sidebar-address--single-line {
    white-space: normal;
  }

  .sg-contact-page .sg-contact-highlight {
    flex-direction: column;
  }

  .sg-contact-page .sg-instant-contact__actions,
  .sg-contact-page .sg-instant-contact__actions--compact {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px 16px;
  }

  .sg-contact-page .sg-instant-contact__action {
    width: 100%;
    justify-content: flex-start;
  }

  .sg-contact-page .sg-instant-contact__action--desktop-only {
    display: none;
  }

  .sg-contact-page .sg-instant-contact__action-wrap {
    display: block;
  }

  .sg-contact-page .sg-instant-contact__action-wrap--wecom {
    margin-top: 0;
    padding-top: 0;
  }

  .sg-contact-page .sg-instant-contact__popover,
  .sg-ui-tooltip__content {
    display: none;
  }

  .sg-contact-page .sg-instant-contact__qr-image,
  .sg-contact-page .sg-instant-contact__qr-placeholder {
    width: 100%;
  }

  .sg-ui-dialog__root {
    padding: 22px 14px;
  }

  .sg-ui-dialog__panel {
    padding: 18px 18px 16px;
    border-radius: 28px;
  }

  .sg-ui-dialog__header {
    justify-content: center;
    margin-bottom: 14px;
  }

  .sg-ui-dialog__title {
    text-align: center;
  }

  .sg-ui-dialog__close {
    display: none;
  }

  .sg-ui-dialog__footer {
    display: block;
  }
}

@media (min-width: 641px) {
  .sg-contact-page .sg-contact-page__inline-instant-contact {
    max-width: none;
    margin-inline: 0;
  }

  .sg-contact-page .sg-instant-contact__action--mobile-only {
    display: none;
  }
}
`;
