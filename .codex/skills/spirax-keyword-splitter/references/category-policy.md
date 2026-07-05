# Category Policy

## Product Category Policy

Use existing product categories in `docs/关键词列表/按产品系列类型拆分/` whenever possible. A keyword can be moved into a product category when the keyword, model token, series name, or type name clearly maps to a product family.

Good product evidence includes:

- Official result title naming the model and product type.
- Official PDF/manual title naming the model and product type.
- Local `全部产品型号列表.md` mapping.
- Multiple existing classified variants showing the same family.

Examples from the prior workflow:

- `spirax sarco b series` -> `疏水阀`, because B Series maps to inverted bucket steam traps and existing B variants were classified as traps.
- `spirax sarco 600 series` -> `疏水阀`, because official search surfaces `600 and 900 Series Inverted Bucket Steam Traps`.
- `spirax sarco type 20 for clean steam` -> `空气加湿器`, because official results identify Type 20/40 direct steam injection humidifiers.
- `spirax sarco type 40` -> `空气加湿器`, for the same Type 20/40 humidifier family.

Do not move terms based only on loose substring hits. For example, a short code appearing inside many unrelated model names remains ambiguous until there is precise evidence.

## Non-Product Buckets

Use `非产品属性拆分/` for non-product intent or attributes:

- `规格参数`: DN, PN, NPT, sizes, pressure classes, flow rates, connection/thread specs.
- `材料牌号`: GGG40, CF8M, A395, CA40F, SG, and similar material grades.
- `规格材料组合`: specification and material grade in the same query.
- `零件物料号`: spare part numbers, electronic board numbers, kit numbers, pure item/material codes.
- `资料编号`: IM/TI/T-P/RIM and similar document identifiers.
- `标准法规`: standards, laws, certifications, compliance.
- `资源格式`: CAD, BIM, DWG, 3D, images, model libraries.
- `资料手册与下载`: manual, catalogue, PDF, handbook, download, book.
- `投资者财务`: stock, share price, annual report, market cap, revenue, FTSE, investor relations.
- `采购渠道与价格`: distributor, dealer, supplier, contact, price list, replacement parts purchase.
- `公司品牌与法人信息`: company, legal entity suffixes, brand, history, subsidiaries.
- `培训教程与课程`: training, academy, webinar, course, learning.
- `招聘雇主信息`: jobs, careers, graduate program, salary, interview, employee reviews.
- `官网账号与媒体资产`: login, portal, app, logo, social media, Revit/media assets.
- `技术知识与参考`: steam tables, saturated/superheated steam, flash steam, engineering references.
- `工程工具与计算器`: sizing tools, calculators, Sizing Suite, software.
- `集团品牌与竞品关联`: Chromalox, Gestra, Hiter, Watson Marlow, Thermocoax, Vulcanic, and related brands.
- `组织人员与治理`: board, CEO/CFO, management, employee count, governance.
- `地区分支机构`: countries, regional branches, local sites.
- `新闻事件与公告`: news, acquisitions, layoffs, announcements.
- `工商税务标识`: CNPJ, CUIT, and similar business/tax identifiers.
- `解决方案与服务`: energy saving, decarbonization, net zero, consulting, steam management services.
- `站内导航与通用查询`: product overview, generic site search, general product navigation.
- `噪声与无效查询`: malformed queries, single letters/digits, or no useful product/search intent.

## Ambiguity Policy

Leave a row in the main CSV when:

- It is a short token with many official substring hits.
- It could map to several product categories and none dominates.
- The only evidence is a broad search result count or unrelated snippet.
- It is unclear whether the query is product, company, resource, or noise.

Use `零件物料号` only when the term looks like a part/material/kit code, not as a dumping ground for every uncertain product token.
