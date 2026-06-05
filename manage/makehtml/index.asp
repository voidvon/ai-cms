<%
if request.Cookies("masterflag")="" or request.Cookies("masterflag")="" then
	response.write "<script language='javascript'>"
	response.write"parent.location.href='../../../spck/login.asp';</SCRIPT>" 
	response.end
end if
 

'权限限制^^^^^^^^^^^^^^^^^^^^
 dim ishavegant
 ishavegant=false
 in_str=split(request.Cookies("masterflag"),",")
 for each ins in in_str
 if trim(ins)="010" then 
 ishavegant=true
 end if
 next 
 if ishavegant=false then
 response.redirect "../../../spck/err.asp"
 response.end
 end if
%>
<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN"
"http://www.w3.org/TR/html4/loose.dtd">
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=gb2312">

<style type="text/css">
<!--
body {
	margin-left: 0px;
	margin-top: 0px;
	margin-right: 0px;
	margin-bottom: 0px;
}
.style1 {
	font-size: 16px;
	font-weight: bold;
	color: #FF0000;
}
-->
</style></head>

<body>
	<LINK href="/spck/css/style.css" rel=stylesheet type=text/css>
	<table border="0" cellspacing="1" cellpadding="3" align=center class="tableBorder"> 
	  <tr> 
		<th width="88%" class="tableHeaderText" height=25>生成网站HTML说明</th> 
		<th width="12%" class="tableHeaderText"> </th>
	  </tr> 
	  <tr> 
		<td colspan="2" class="forumRowHighlight"><p><B>总则</B>：<BR> 
			①:从里往外生成，既先生成 详细内容页 >> 小分类 >> 大分类 >> 各版块首页。<br>
	②:生成HTML页应按照顺序来生成，既生成完一类后再生成下一类。<br>
	</td> 
	  </tr> 
	</table>
	  <br>
	  <table border="0" cellspacing="1" cellpadding="3" align=center class="tableBorder"> 
		<tr> 
		  <th height=25 colspan="3" class="tableHeaderText">生成HTML页操作选项</th> 
		</tr> 
		<tr> 
		  <td width=18% height=40 class="forumRowHighlight"><strong>生成所有详细内容页:</strong></td> 
		  <td class="forumRowHighlight" width=39%>说明：此生成的为网站详细的内容页！</td>
		  <td class="forumRowHighlight" width=43%  > <img src="../../images/indexpoint.gif" width="5" height="9" align="absmiddle"> <a href="makedetail_my.asp"  >进入按需生成各类的详细页面</a></td>
		</tr>    <tr> 
		  <td width=18% height=40 class="forumRowHighlight"><strong>生成二级分类页：</strong>	  </td> 
		  <td class="forumRowHighlight" width=39%>说明：此生成的为网站二级分类！</td>
		  <td class="forumRowHighlight" width=43%  ><img src="../../images/indexpoint.gif" width="5" height="9" align="absmiddle"> <a href="makelist_my.asp">开始生成二级分类</a></td>
		</tr> <tr> 
		  <td width=18% height=40 class="forumRowHighlight"><strong>生成一级分类页：</strong>
			
	
	        <div id="Layer4" style="position:absolute; left:20px; top:295px; background-color: #FFFFFF; z-index:1; visibility: hidden;" onMouseOver="MM_showHideLayers('Layer4','','show')" onMouseOut="MM_showHideLayers('Layer4','','hide')"> 
		<table width="110" border="0" cellspacing="0" cellpadding="2" style="border:2px #658BD8 solid;"> 
		  <tr> 
			<td width="13" align="right">&nbsp;</td> 
			<td width="87" class="S" style="padding-top:8px">生成内容列表<br> 
			  ------------</td> 
		  </tr> 
		  <tr> 
			<td align="right"><img src="/image/icon_arrow.gif" width="6" height="5"></td> 
			<td class="S"><a href="tradeinfo/maketrade.asp?all=all" target="_blank">生成供应内容</a></td> 
		  </tr> 
		  <tr> 
			<td align="right"><img src="/image/icon_arrow.gif" width="6" height="5"></td> 
			<td class="S"><a href="seller/maketrade.asp?all=all" target="_blank">生成求购内容</a></td> 
		  </tr> 
		  <tr> 
			<td align="right"><img src="../../image/icon_arrow.gif" width="6" height="5"></td> 
			<td class="S"><a href="vipinfo/makelist.asp?all=all" target="_blank">生成专项商机</a></td> 
		  </tr> 
		  <tr> 
			<td align="right"><img src="/image/icon_arrow.gif" width="6" height="5"></td> 
			<td class="S"><a href="corporation/maketrade.asp?all=all" target="_blank">生成公司内容</a></td> 
		  </tr> 
					<tr> 
			<td align="right"><img src="/image/icon_arrow.gif" width="6" height="5"></td> 
			<td class="S"><a href="productshow/maketrade.asp?all=all" target="_blank">生成产品信息</a></td> 
		  </tr> 
		  <tr> 
			<td align="right"><img src="/image/icon_arrow.gif" width="6" height="5"></td> 
			<td class="S"><a href="expo/makelist.asp?all=all" target="_blank">生成展会内容</a></td> 
		  </tr> 
		  <tr> 
			<td align="right"><img src="/image/icon_arrow.gif" width="6" height="5"></td> 
			<td class="S"><a href="expo/makelist_info.asp?all=all" target="_blank">生成展会资讯</a></td> 
		  </tr> 
		  <tr> 
			<td align="right"><img src="/image/icon_arrow.gif" width="6" height="5"></td> 
			<td class="S"><a href="info/makelist.asp?all=all" target="_blank">生成行业资讯</a></td> 
		  </tr> 
		  <tr> 
			<td align="right"><img src="/image/icon_arrow.gif" width="6" height="5"></td> 
			<td class="S"><a href="help/makelist.asp?all=all" target="_blank">生成帮助信息</a></td> 
		  </tr> 
		  <tr> 
			<td align="right"><img src="/image/icon_arrow.gif" width="6" height="5"></td> 
			<td class="S"><a href="feedback/makelist.asp?all=all" target="_blank">生成意见建议</a></td> 
		  </tr> 
		  <tr> 
			<td height="5"></td> 
		  </tr> 
		</table> 
		  </div></td> 
		  <td class="forumRowHighlight" width=39%>说明：此生成的为网站一级分类！</td>
		  <td class="forumRowHighlight" width=43%  ><img src="../../images/indexpoint.gif" width="5" height="9" align="absmiddle"> <a href="maketrade.asp" target="main">开始生成一级分类</a>(<span class="STYLE1">数据资源较大慎用</span>！)</td>
		</tr><tr> 
		  <td width=18% height=40 class="forumRowHighlight"><strong>生成各版块首页：</strong></td> 
		  <td class="forumRowHighlight" width=39%>说明：此生成的为网站各版块首页！</td>
		  <td class="forumRowHighlight" width=43%  ><img src="../../images/indexpoint.gif" width="5" height="9" align="absmiddle"> <a href="index/index.asp">开始批量生成各版块首页</a>(<span class="STYLE1">数据资源较大慎用</span>！)</td>
		</tr> </table> 
	<br>
</body>
</html>
</body>
</html>


