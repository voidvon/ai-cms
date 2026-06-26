import { getDb } from '../src/db.mjs';
import { ensureTemplatesSchema, getTemplateById, publishTemplate, updateTemplate } from '../src/services/templates.mjs';

const TEMPLATE_ID = 29;

const PICK_OBJECT_FIT_SOURCE = `  const normalizeStyle = (value) => (value && typeof value === 'object' ? value : {});
  const pickObjectFit = (style) => {
    if (!style || typeof style !== 'object') {
      return undefined;
    }
    if (typeof style.objectFit === 'string' && style.objectFit.trim()) {
      return style.objectFit;
    }
    return undefined;
  };
`;

const DEFAULT_ASPECT_RATIO_SOURCE = `    imageAspectRatio = '4 / 3',
`;

const OLD_DEFAULT_ASPECT_RATIO_SOURCE = `    imageAspectRatio = '',
`;

const IMAGE_LOGIC_SOURCE = `          const resolvedAspectRatio = card?.imageAspectRatio || imageAspectRatio || '';
          const resolvedImageStyle = {
            ...normalizeStyle(imageStyle),
            ...normalizeStyle(card?.imageStyle)
          };
          const resolvedObjectFit = pickObjectFit(resolvedImageStyle) || 'cover';
          const imageNode = card?.image ? (
            resolvedAspectRatio ? (
              <div style={{ aspectRatio: resolvedAspectRatio, overflow: 'hidden' }}>
                <img
                  alt={card?.imageAlt || card?.title || ''}
                  className={imageClassName}
                  height={imageHeight}
                  loading={imageLoading}
                  src={card.image}
                  style={{
                    ...resolvedImageStyle,
                    width: '100%',
                    height: '100%',
                    objectFit: resolvedObjectFit
                  }}
                  width={imageWidth}
                />
              </div>
            ) : (
              <img
                alt={card?.imageAlt || card?.title || ''}
                className={imageClassName}
                height={imageHeight}
                loading={imageLoading}
                src={card.image}
                style={Object.keys(resolvedImageStyle).length > 0 ? resolvedImageStyle : undefined}
                width={imageWidth}
              />
            )
          ) : null;
          const body = (
            <>
              {imageNode}
`;

const OLD_PICK_OBJECT_FIT_SOURCE = `  const normalizeStyle = (value) => (value && typeof value === 'object' ? value : {});
`;

const OLD_IMAGE_LOGIC_SOURCE = `          const resolvedAspectRatio = card?.imageAspectRatio || imageAspectRatio || '';
          const resolvedImageStyle = {
            ...(resolvedAspectRatio ? { aspectRatio: resolvedAspectRatio } : {}),
            ...normalizeStyle(imageStyle),
            ...normalizeStyle(card?.imageStyle)
          };
          const body = (
            <>
              {card?.image ? (
                <img
                  alt={card?.imageAlt || card?.title || ''}
                  className={imageClassName}
                  height={imageHeight}
                  loading={imageLoading}
                  src={card.image}
                  style={Object.keys(resolvedImageStyle).length > 0 ? resolvedImageStyle : undefined}
                  width={imageWidth}
                />
              ) : null}
`;

function assertReplace(source, search, replacement) {
  if (source.includes(replacement)) {
    return source;
  }
  if (!source.includes(search)) {
    throw new Error(`未找到待替换内容:\n${search}`);
  }
  return source.replace(search, replacement);
}

getDb();
ensureTemplatesSchema();

const template = getTemplateById(TEMPLATE_ID);
if (!template) {
  throw new Error(`未找到模板 ${TEMPLATE_ID}`);
}

let nextTsxSource = String(template.tsx_source || '');
nextTsxSource = assertReplace(nextTsxSource, OLD_DEFAULT_ASPECT_RATIO_SOURCE, DEFAULT_ASPECT_RATIO_SOURCE);
nextTsxSource = assertReplace(nextTsxSource, OLD_PICK_OBJECT_FIT_SOURCE, PICK_OBJECT_FIT_SOURCE);
nextTsxSource = assertReplace(nextTsxSource, OLD_IMAGE_LOGIC_SOURCE, IMAGE_LOGIC_SOURCE);

let nextCssSource = String(template.css_source || '');
nextCssSource = nextCssSource.replace('\n  align-items: start;', '');
nextCssSource = nextCssSource.replace('\n  align-self: start;', '');

updateTemplate(TEMPLATE_ID, {
  ...template,
  tsx_source: nextTsxSource,
  css_source: nextCssSource
});

publishTemplate(TEMPLATE_ID, '通过组件内部图片容器强制 media_card_grid 4:3 比例，撤回额外样式覆盖');

console.log('media_card_grid template updated.');
