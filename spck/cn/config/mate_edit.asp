<% data_path="../../../" 'ACC连接数据库路径，对SQL无效 %>
<!--#include file="../../../conn/conn.asp"-->
<!--#include file="../../../inc/safe.asp"-->
<%
if request.Cookies("masterflag")="" or request.Cookies("masterflag")="" then
	response.write "<script language='javascript'>"
	response.write"parent.location.href='../../login.asp';</SCRIPT>" 
	response.end
end if
 

'权限限制^^^^^^^^^^^^^^^^^^^^
 dim ishavegant
 ishavegant=false
 in_str=split(request.Cookies("masterflag"),",")
 for each ins in in_str
 	if trim(ins)="02" then 
 		ishavegant=true
 	end if
 next 
 if ishavegant=false then
	 response.redirect "../../err.asp"
 	response.end
 end if
 id=request.QueryString("id")
 Sql="Select * from benming_ch_MetaType where id="&id
 Set Rs=Server.CreateObject("ADODB.RecordSet")
 Rs.open Sql,Conn,1,1
 if Rs.eof=False and Rs.bof=False then
 
 %>
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=gb2312">
<LINK href="../../css/style.css" rel=stylesheet type=text/css>
</head>
<SCRIPT language=javascript>
function FORM1_onsubmit()
{
	if(document.FORM1.typename.value=="")
 	{
   		alert("请输入页面名称!");
   		document.FORM1.typename.focus();
   		return false;
 	}
}

</SCRIPT> 
<table width="98%" border="0" cellspacing="0" cellpadding="0"  align=center class="tableBorder"> 
  <tr> 
     <th width="100%" height=25 class="tableHeaderText"> 网站Meta信息管理 </th> 
  </tr> 
  <tr> 
     <td class="forumRowHighlight"><B>注意</B>：<BR> 
         ①网站Meta信息的关键字和描述信息是用于搜索引擎搜索页面用途; <font color="red">请用"|"将各词之间隔开</font> </td> 
  </tr>
  <tr>
    <td align="center" class="forumRowHighlight"><a href="Meta_keywords.asp">关键字管理</a> | <a href="Meta_keywords_add.asp">添加页面关键字</a> | </td>
  </tr> 
</table>

<FORM name="FORM1" id="FORM1" onSubmit="return FORM1_onsubmit()" action="Mate_save.asp?action=edit" method="post"> 
<input name="hidid" type="hidden" value="<%=Rs("id")%>">
  <TABLE width=100% border="0" align="center" cellPadding=3 cellSpacing=1 class="tableBorder"> 
    <TR> 
      <Th colSpan=3 height="28" class="tableHeaderText">添加页面关键字</Th> 
    </TR> 
    <TR>
      <TD height=25 class="forumRowHighlight" align=right><b>页面名称：</b></TD>
      <TD height=25 colspan="2" class="forumRowHighlight"><input name="typename" type="text" id="typename" value="<%=Rs("typename")%>" size="30" maxlength="100">
        <span class="red">*</span></TD>
    </TR>
    <TR>
      <TD height=25 class="forumRowHighlight" align=right><b>Meta关键字：</b></TD>
      <TD height=25 colspan="2" class="forumRowHighlight"><input name="meta_keywords" type="text" id="meta_keywords" value="<%=Rs("meta_keywords")%>" size="60"></TD>
    </TR>
    <TR> 
      <TD width=18% height=25 class="forumRowHighlight" align=right><b>Meta描述信息：</b></TD> 
      <TD height=25 colspan="2" class="forumRowHighlight"><INPUT name="meta_descriptions" id="meta_descriptions" value="<%=Rs("meta_descriptions")%>" size=60></TD> 
    </TR> 
    <TR>
      <TD height="27"  class="forumRowHighlight" align="right"><b>页面标题：</b></TD>
      <TD height="27" colspan="2"  class="forumRowHighlight"><INPUT name="title" id="title" value="<%=Rs("title")%>" size=60></TD>
    </TR>
    <TR> 
      <TD height="27" align=center class="forumRowHighlight">&nbsp;</TD> 
      <TD width="38%" height="27" align=center class="forumRowHighlight"><input type=submit value='确 定 修 改' name=Submit2></TD>
      <TD width="44%" align=center class="forumRowHighlight">&nbsp;</TD>
    </TR> 
  </TABLE> 
 </FORM> 
	<br/>
</body>
</html>
<%
else
%>
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=gb2312">
<title>操作成功</title>
<link rel="stylesheet" type="text/css" href="../../css/style.css">
</head>
<body>
<table cellpadding=2 cellspacing=1 border=0 width=400 class=tableBorder align=center><TR>
  	<TH class=tableHeaderText colSpan=2 height=25>错误</TH>
	<TR>
		<tr>
			<td height=85 valign=top class=forumRow>
				<div align=center>
					<br><br>
					数据不存在或数据已被删除
					<br><br>
				
				</div>
			</td>
		</tr>
		<tr align=center>
			<td height=30 class=forumRowHighlight><a href='Meta_keywords.asp'>&lt;&lt; 返回</a></td>
		</tr>
</table>
<br>
</body>
</html>
<%end if%>