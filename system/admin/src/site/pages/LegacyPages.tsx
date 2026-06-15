import React from 'react'
import type {
  LegacyArticleDetailPageProps,
  LegacyArticleListPageProps,
  LegacyContactPageProps,
  LegacyContentPageProps,
  LegacyHomePageProps,
  LegacyPageBaseProps,
  LegacyProductDetailPageProps,
  LegacyProductListPageProps,
} from '../types'

function html(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function raw(value: string | null | undefined) {
  return { __html: value || '' }
}

function legacySearchForm(buttonName = 'searchbutton') {
  return `<form id="form2" name="form2" method="post" action="/search"><p>
            <input name="ProductsName" type="text" id="ProductsName" value="找找看" size="18"  class="Font_666666_a" onfocus="this.value='';" />
            <input name="${buttonName}" type="submit" id="${buttonName}" value="" />
          </p>
        </form>`
}

function cCssHead(children: React.ReactNode) {
  return (
    <head>
      {children}
      <link href="/css/c.css" rel="stylesheet" type="text/css" />
    </head>
  )
}

function productLeft(props: LegacyPageBaseProps, headingTag: 'h2' | 'span' = 'h2') {
  const heading = headingTag === 'h2' ? '<h2><span>产品</span></h2>' : '<span>产品</span>'
  return `${heading}
        <div id="LeftMenu" class="ddsmoothmenu-v">
          <ul>
${props.fragments.productsMenuHtml || ''}
          </ul>
        </div>`
}

function cLayoutBody(props: LegacyPageBaseProps, rightHtml: string, leftExtra = '', productHeading: 'h2' | 'span' = 'h2') {
  return `${props.fragments.indextopHtml || ''}
<div id="page_main" class="clearfix">
    <div class="page-right">${rightHtml}</div>
    <div class="page-left">
      <div class="left-products">
        ${productLeft(props, productHeading)}
      </div>${leftExtra}
      <div class="left-search">
        ${productHeading === 'h2' ? '<h2><span>站内搜索</span></h2>' : '<span>站内搜索</span>'}
${legacySearchForm()}
      </div><div class="index-contact">

</div></div>
</div>
    ${props.fragments.bottomHtml || ''}
</div>`
}

export function LegacyHomePage(props: LegacyHomePageProps) {
  const body = `${props.fragments.indextopHtml || ''}
<div id="index_main" class="clearfix"><div class="index-left">
<div class="index-news">
<h2><span>新闻中心</span><a href="/news"><img src="images/more.gif" width="32" height="5" alt="新闻中心" /></a></h2><ul>${props.newsIndexHtml}</ul>
</div><div class="index-about">
<h2><span>关于我们</span><a href="/about"><img src="images/more.gif" width="32" height="5" alt="关于我们" /></a></h2>
<p><img src="images/index_aboutpic.jpg" alt="关于我们" width="145" height="181" />${props.fragments.aboutHtml || ''}</div><div class="index-newproducts"><h2><a href="/valve"><img src="images/more.gif" width="32" height="5" alt="产品" /></a></h2>
<div class="productsroll"><div id="LeftArr1"></div><div id="RightArr1"></div><ul id="ScrollBox" class="clearfix">${props.featuredProductsHtml}</ul>
<script language="javascript" type="text/javascript"><!--//--><![CDATA[//><!--
var scrollPic_01 = new ScrollPic();
scrollPic_01.scrollContId   = "ScrollBox";
scrollPic_01.arrLeftId      = "LeftArr1";
scrollPic_01.arrRightId     = "RightArr1";
scrollPic_01.frameWidth     = 648;
scrollPic_01.pageWidth      = 324;
scrollPic_01.speed          = 10;
scrollPic_01.space          = 5;
scrollPic_01.autoPlay       = true;
scrollPic_01.autoPlayTime   = 3;
scrollPic_01.initialize();
//--><!]]></script> 
</div></div><div class="index-products">
<h2><span>产品</span><a href="/valve"><img src="images/more.gif" width="32" height="5" alt="产品" /></a></h2>
<ul class="clearfix">${props.featuredProductLinksHtml}</ul></div></div>
<div class="index-right"><div class="index-search"><h2><span>站内搜索</span></h2>
${legacySearchForm()}</div>
<div class="index-jobs">
<h2><span>阀门知识</span><a href="/service/"><img src="images/more.gif" width="32" height="5" alt="阀门知识" /></a></h2>
<ul>${props.serviceIndexHtml}</ul>
</div><div class="index-contact"><h2><span>联系我们</span></h2><p>
地址: ${html(props.site.company_address)}<br>电话: ${html(props.site.company_phone)}<br>传真: ${html(props.site.company_fax)}<br>手机: ${html(props.site.web_mobile)}<br>邮箱: ${html(props.site.company_email)}</p>
</div><A href="tencent://message/?uin=${html(props.site.web_qq)}&Site=${html(props.site.company_name)}&Menu=yes" target=blank><IMG alt=${html(props.site.company_name)}在线客服 src="/images/13_online.gif" border="0"></A></div>
</div> ${props.fragments.indexFootHtml || ''}</div>`

  return (
    <html xmlns="http://www.w3.org/1999/xhtml">
      <head>
        <meta httpEquiv="Content-Type" content="text/html; charset=utf-8" />
        <title>{props.site.web_name || ''}</title>
        <meta name="robots" content="all" />
        <meta name="keywords" content="" />
        <meta name="description" content="" />
        <meta httpEquiv="X-UA-Compatible" content="IE=EmulateIE7" />
        <link rel="icon" href="/favicon.ico" type="image/x-icon" />
        <link rel="shortcut icon" href="/favicon.ico" type="image/x-icon" />
        <link href="css/webmain.css" rel="stylesheet" type="text/css" />
        <meta content="MSHTML 6.00.2900.3132" name="GENERATOR" />
        <base target="_blank" />
      </head>
      <body dangerouslySetInnerHTML={raw(body)} />
    </html>
  )
}

export function LegacyContactPage(props: LegacyContactPageProps) {
  const rightHtml = `<div class="site-nav"><span>当前位置 : </span><a href="/index.html">公司主页</a> &gt;&gt; <a href="/Contact.html" title="联系我们">联系我们</a> </div>
	  <div class="page-products">
      <ul class="clearfix">
<table class="con-add"><tbody><tr><td valign="top">
 <strong>spiraxsarco International</strong><br> 816 Maple Street<br> Three Rivers, MI 49093<br> <strong>USA</strong><br> Phone: (269) 273-1415<br> Fax: (269) 278-6555<br> Complete and submit form below.<br> 
</td><td valign="top">
<strong>spiraxsarco International, SA.</strong><br> Parc Industriel Des Hauts-Sarts<br> B-4040 Herstal<br> Liege, <strong>Belgium</strong><br> Phone: (32) (04) 2409090<br> Fax: (32) (04) 2481361<br> E-Mail: info@<strong>spiraxsarco</strong>international.eu 
</td></tr><tr><td valign="top">
<strong>${html(props.site.company_name)}</strong><br>${html(props.site.company_address)}<br> 邮编：201406, <strong>P.R. China</strong><br>电话：${html(props.site.company_phone)}<br> 传真：86-${html(props.site.company_fax)}<br> 电子邮件：${html(props.site.company_email)}
</td><td valign="top">
<strong>spiraxsarco International Private Limited</strong><br> Mahindra World City, P46, Eighth Avenue<br> Anjur Village, Nathm Sub<br> Chengalpattu 603 002<br> <strong>India</strong><br> Phone: (044) 37474444<br> Fax: (044) 37474440<br> E-Mail: sales@<strong>spiraxsarco</strong>international.in
</td></tr><tr><td valign="top">
<strong>spiraxsarco International Mexico S de RL de CV</strong><br> Calle Industria 1228-A<br> Col. El Mirador, Zona Oblatos.<br> Guadalajara, JAL 44380<br> <strong>Mexico</strong><br> Phone: +52 (33) 3883-1790<br> E-Mail: dmondragon@<strong>spiraxsarco</strong>international.com 
</td><td valign="top">
<strong>spiraxsarco Service France</strong><br> Port 4008 - Route du Hoc<br> 76700 Gonfreville L'Orcher<br><strong>France</strong><br> Phone: +33(0)2 35 53 68 35<br> Fax: +33 (0)2 35 53 68 37<br> E-Mail: info.fr@<strong>spiraxsarco</strong>international.eu <br>N<sup>o</sup> SIRET 482 718 491 00020
</td></tr><tr><td valign="top">
<strong>spiraxsarco International SA</strong><br> Manchester Business Park<br> 3000 Aviator Way<br> M22 5TG - Manchester<br> <strong>United Kingdom</strong><br> Phone: +44 01612662279<br> Fax: +44 01612661001<br> E-Mail: info.uk@<strong>spiraxsarco</strong>international.eu
</td><td valign="top">
<strong>spiraxsarco International Korea Co., Ltd.</strong><br> 3-Na, 503Ho, 1289-2 Jeongwang-dong<br> Siheung-si, Gyeonggi-do 429-850<br> <strong> South Korea</strong><br> Phone: (82)(031) 497-5310<br> FAX: (82)(031) 433-6924<br> E-Mail: empark@spiraxsarcokorea.com
</td></tr><tr><td valign="top">
<strong>Veris - Flow Measurement</strong><br>6315 Monarch Park Place<br>Niwot, CO 80503<br><strong>USA</strong><br>Phone: (303) 652-8550<br>Fax: (303) 652-8552<br> Complete and submit form below.<br>
</td><td valign="top"></td></tr></tbody></table>
${props.contactTableHtml}</ul><div class="page_list"><div class="list_info"></div></div></div>`
  return (
    <html xmlns="http://www.w3.org/1999/xhtml">
      {cCssHead(<>
        <meta httpEquiv="Content-Type" content="text/html; charset=utf-8" />
        <title>{`联系${props.site.web_name || ''}`}</title>
        <meta name="keywords" content="" />
        <meta name="description" content="" />
      </>)}
      <body dangerouslySetInnerHTML={raw(cLayoutBody(props, rightHtml, '', 'span'))} />
    </html>
  )
}

export function LegacyContentPage(props: LegacyContentPageProps) {
  const rightHtml = `<div class="site-nav"><span>当前位置 : </span><a href="/index.html">公司主页</a> &gt;&gt; ${html(props.title)} </div>
	  <div class="page-products"><ul class="clearfix">${props.contentHtml}
</ul><div class="page_list"><div class="list_info"></div></div></div>`
  return (
    <html xmlns="http://www.w3.org/1999/xhtml">
      {cCssHead(<>
        <meta httpEquiv="Content-Type" content="text/html; charset=utf-8" />
        <title>{`${props.title || ''}_${props.site.web_name || ''}`}</title>
        <meta name="keywords" content={props.title || ''} />
        <meta name="description" content={props.title || ''} />
      </>)}
      <body dangerouslySetInnerHTML={raw(cLayoutBody(props, rightHtml, props.fragments.aboutCategoryHtml || ''))} />
    </html>
  )
}

export function LegacyProductListPage(props: LegacyProductListPageProps) {
  const body = cLayoutBody(props, `<div class="site-nav"><span>当前位置 : </span><a href="/index.html">公司主页</a> -<a href="/valve/" > 产品 </a>-<A href="/valve/${html(props.bigId)}.html" class="F_a"> ${html(props.bigName)} </A>-${html(props.smallName)}</div>
	  <table width="100%" border="0" cellpadding="0" cellspacing="0"><tr><td>${props.productsSmallCatHtml}</td></tr></table>
      <div class="page-products"><ul class="clearfix">${props.bodyHtml}</ul><div class="page_list"><div class="list_info"></div></div></div>`)
  return (
    <html xmlns="http://www.w3.org/1999/xhtml">
      {cCssHead(<>
        <meta httpEquiv="Content-Type" content="text/html; charset=utf-8" />
        <title>{`${props.smallName}|${props.smallName}型号|${props.smallName}尺寸|${props.site.web_name || ''}`}</title>
        <meta name="keywords" content={props.prodKeywords} />
        <meta name="description" content={`${props.smallName}制造标准：中国GB、美标API、德标DIN等标准生产。${props.smallName}材质：铜、铸铁、铸钢、不锈钢、低温钢等。连接方式：螺纹、法兰、焊接。驱动方式：手动、气动、电动。拥有顶尖的生产设备和技术工程师，按照各国标准以及各种行业标准生产制造各种阀门。`} />
        <meta httpEquiv="X-UA-Compatible" content="IE=EmulateIE7" />
      </>)}
      <body dangerouslySetInnerHTML={raw(body)} />
    </html>
  )
}

export function LegacyProductDetailPage(props: LegacyProductDetailPageProps) {
  const body = cLayoutBody(props, `<div class="site-nav"><span>当前位置 : </span><a href="/index.html">公司主页</a> - <a href="/valve/">产品</a> - ${html(props.title)}</div>
      <table width="100%" border="0" cellpadding="0" cellspacing="0" class="in4">
	    <tr><td width="19%" height="151" align="center" valign="top" class="in5"><img src="${html(props.image)}" alt="${html(props.title)}" width="160" height="134" /></td>
<td width="41%" valign="top" class="in5"><table width="100%" height="151" border="0"">
  <tr><td width="24%" height="20" class="Font-Weight">产品名称：</td><td width="76%" class="Font_2E4690_a Font-Weight">${html(props.title)}</td></tr><tr>
  <td height="20" class="Font-Weight">产品型号：</td><td class="Font-Weight Font_2E4690_a">${html(props.code)}</td></tr><tr>
  <td height="27" colspan="2" align="left"><A href="tencent://message/?uin=${html(props.site.web_qq)}&Site=${html(props.site.company_name)}&Menu=yes" target=blank><IMG src="/images/gmzx.gif" border=0></A></td>
</tr><tr><td height="26" colspan="2" align="left"><span class="Font_FF0000_a Font-Weight">咨询电话：${html(props.site.company_phone)}</span></td></tr>
<tr><td height="22" colspan="2" align="left"><span class="Font_FF0000_a Font-Weight">传真：${html(props.site.company_fax)}</span></td></tr><tr></tr></table></td>
<td width="40%" valign="top">${props.relatedProductsHtml}</td></tr></table>
      <div class="page-products"><ul class="clearfix"><table width="100%" border="0"><tr>
<td height="30" class="prod_bottom_dasheds">产品介绍</td></tr><tr>
  <td height="15" align="left" valign="top" class="prod_sp">${props.bodyHtml}<br></td>
</tr></table></ul><div class="page_list"><div class="list_info"></div></div></div>`)
  return (
    <html>
      <head>
        <meta httpEquiv="Content-Type" content="text/html; charset=utf-8" />
        <title>{`${props.title}|${props.prodKeywords}`}</title>
        <meta name="keywords" content={props.prodKeywords} />
        <meta name="description" content={props.prodDescription} />
        <meta httpEquiv="X-UA-Compatible" content="IE=EmulateIE7" />
        <meta name="classification" content={props.title} />
        <link href="/css/c.css" rel="stylesheet" type="text/css" />
      </head>
      <body dangerouslySetInnerHTML={raw(body)} />
    </html>
  )
}

function articleSidebar(props: LegacyArticleListPageProps | LegacyArticleDetailPageProps) {
  const isService = props.section === 'service'
  const catHtml = isService ? props.fragments.serviceCategoryHtml : props.fragments.newsCategoryHtml
  const catTitle = isService ? '阀门知识' : '新闻分类'
  return `<table width="165" border="0" align="left" cellpadding="0" cellspacing="0"><tr><td width="5"><img src="/Skin/blue/Images/menu_left.jpg" width="5" height="29" /></td>
<td width="155" align="center" background="/Skin/blue/Images/menu_bg.jpg" class="F_a Font-Weight">${catTitle}</td>
<td width="5"><img src="/Skin/blue/Images/menu_right.jpg" width="5" height="29" /></td></tr><tr>
<td colspan="3" bgcolor="#F4F4F4" class="Corporation_left">${catHtml || ''}</td></tr></table><DIV style="clear:both;"></DIV>
<table width="165" border="0" align="left" cellpadding="0" cellspacing="0"><tr><td width="5"><img src="/Skin/blue/Images/menu_left.jpg" width="5" height="29" /></td>
<td width="155" align="center" background="/Skin/blue/Images/menu_bg.jpg" class="F_a Font-Weight">产品分类</td>
<td width="5"><img src="/Skin/blue/Images/menu_right.jpg" width="5" height="29" /></td></tr><tr><td colspan="3" bgcolor="#F4F4F4" class="Corporation_left">
${props.fragments.productsMenuHtml || ''}</td></tr></table><DIV style="clear:both;"></DIV><DIV style="PADDING-TOP:3px"></DIV>
<table width="165" border="0" align="left" cellpadding="0" cellspacing="0" class="Table_boder"><tr><td width="71" rowspan="3" align="right">
<img src="../../Skin/blue/Images/service.jpg" width="70" height="130" /></td>
    <td width="81">&nbsp;<A href="/Contact.html" class="0a">业务联系</A></td></tr><tr>
  <td height="30">&nbsp;<a href="/Contact.html" class="0a">客服电话</a></td></tr></table>`
}

export function LegacyArticleListPage(props: LegacyArticleListPageProps) {
  const isService = props.section === 'service'
  const label = isService ? '阀门知识' : '公司新闻'
  const dir = isService ? 'service' : 'news'
  const body = `${props.fragments.topHtml || ''}<table width="${isService ? '986' : '972'}" border="0" align="center" cellpadding="0" cellspacing="0"><tr><td width="173" valign="top">
${articleSidebar(props)}</td><td width="${isService ? '821' : '812'}" valign="top" ><table width="100%" border="0" align="right" cellpadding="0" cellspacing="0"><tr>
<td width="5"><img src="/Skin/blue/Images/menu_left.jpg" width="5" height="29" /></td><td width="${isService ? '25' : '28'}" align="right" background="/Skin/blue/Images/menu_bg.jpg" class="F_a Font-Weight">
<img src="/Skin/blue/Images/index_01.jpg" width="12" height="5" /></td>
<td width="${isService ? '393' : '395'}" background="/Skin/blue/Images/menu_bg.jpg" class="F_a Font-Weight">&nbsp; <A href="/" class="F_a">首页</A> - <A href="/${dir}/" class="F_a">${label}</A> - <A href="${html(props.categoryId)}.html" class="F_a">${html(props.title)}</A></td>
<td width="${isService ? '393' : '395'}" background="/Skin/blue/Images/menu_bg.jpg" class="F_a Font-Weight"></td>
<td width="6"><img src="/Skin/blue/Images/menu_right.jpg" width="5" height="29" /></td></tr><tr><td height="${isService ? '814' : '465'}" colspan="5" valign="top" class="${isService ? 'Right_dasheds_line' : 'in4'}">
<div align="left"><table width="${isService ? '814' : '810'}" height="58" border="0" align="center" cellpadding="0" cellspacing="0"><tr><td width="814">${props.bodyHtml} </td></tr></table></div></td>
</tr></table></td></tr></table>${props.fragments.bottomHtml || ''}</div>`
  return (
    <html xmlns="http://www.w3.org/1999/xhtml">
      <head>
        <meta httpEquiv="Content-Type" content="text/html; charset=utf-8" />
        <title>{`${props.title || label}_${props.site.web_name || ''}`}</title>
        <meta name="keywords" content={props.title || label} />
        <meta name="description" content={props.title || label} />
        <meta content="阀门，球阀，闸阀" name="classification" />
        <link href="/img/css.css" type="text/css" rel="stylesheet" />
        <link href="/css/webmain.css" rel="stylesheet" type="text/css" />
      </head>
      <body onContextMenu={() => false} onMouseDown={() => false} dangerouslySetInnerHTML={raw(body)} />
    </html>
  )
}

export function LegacyArticleDetailPage(props: LegacyArticleDetailPageProps) {
  const isService = props.section === 'service'
  const label = isService ? '阀门知识' : '公司新闻'
  const dir = isService ? 'service' : 'news'
  const body = `${props.fragments.topHtml || ''}<table width="972" border="0" align="center" cellpadding="0" cellspacing="0"><tr><td width="173" height="239" valign="top">
${articleSidebar(props)}</td><td width="812" valign="top" ><table width="812" border="0" align="right" cellpadding="0" cellspacing="0"><tr>
<td width="${isService ? '409' : '7'}" height="25" ${isService ? 'valign="middle"' : ''} background="../../Skin/blue/Images/news_news.jpg"></td><td width="${isService ? '415' : '817'}" align="${isService ? 'left' : 'center'}"><div align="${isService ? 'left' : 'center'}">
<A href="/" class="Font_000000_B_a">首页</A> - <A href="/${dir}/" class="Font_000000_B_a">${label}</A> - <A href="/${dir}/${html(props.typeId)}.html" class="Font_000000_B_a">${html(props.catName)}</A></div>
</td></tr><tr><td colspan="2" valign="top"><table width="${isService ? '98%' : '97%'}" border="0" align="center" cellpadding="0" cellspacing="0">
<tr><td height="40" align="center" class="Font-Weight Font_Size ${isService ? 'in6' : 'in4'}">${html(props.title)}</td></tr><tr><td height="${isService ? '31' : '74'}" align="left" valign="top" class="news_sp ${isService ? 'in6' : 'in4'}">
<p>${props.bodyHtml}&nbsp;</p></td>
</tr></table><table width="95%" border="0" align="center"><tr><td height="30" class="Font-Weight">&nbsp;上一条：${props.previousHtml} &nbsp;&nbsp;&nbsp;&nbsp;
下一条：${props.nextHtml}</td></tr></table></td></table></td></table>${isService ? '</div><div align="center">' : ''}${props.fragments.bottomHtml || ''}${isService ? '</div>' : '</div>'}`
  return (
    <html xmlns="http://www.w3.org/1999/xhtml">
      <head>
        <meta httpEquiv="Content-Type" content="text/html; charset=utf-8" />
        <title>{`${props.title}_${isService ? props.catName : props.site.web_name || ''}`}</title>
        <meta name="keywords" content={`${props.title},${props.newsKeywords}`} />
        <meta name="description" content={props.newsDescription} />
        <meta content="阀门，球阀，闸阀" name="classification" />
        <link href="/img/css.css" type="text/css" rel="stylesheet" />
        <link href="/css/webmain.css" rel="stylesheet" type="text/css" />
      </head>
      <body onContextMenu={() => false} onCopy={() => false} onCut={() => false} onSelect={() => false} dangerouslySetInnerHTML={raw(body)} />
    </html>
  )
}
