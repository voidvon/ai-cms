<% data_path="../../../../" 'ACC连接数据库路径，对SQL无效 %>
<!--#include file="../../../../conn/conn.asp"-->
<%
if request.Cookies("masterflag")="" or request.Cookies("masterflag")="" then
	response.write "<script language='javascript'>"
	response.write"parent.location.href='../../../login.asp';</SCRIPT>" 
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
	 response.redirect "../../../../err.asp"
 	response.end
 end if
 id=request.QueryString("id")
Sql="Select News_sort1,tempname from benming_ch_worldec_Temp where id="&id
Set Rs=Server.CreateObject("ADODB.RecordSet")
Rs.open Sql,Conn,1,3
if request.QueryString("action")="saveedit" then
	Rs("News_sort1")=request.form("News_sort1")
	Rs.update
	Rs.close
	Set Rs=nothing
	Conn.close
	Set Conn=nothing
	Response.Redirect("worldec_index.asp?id="&id)
else
	tempname=rs("tempname")
	News_sort1=Rs("News_sort1")
	Rs.close
	Set RS=nothing
	Conn.close
	Set Conn=nothing
end if
 %>
<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN"
"http://www.w3.org/TR/html4/loose.dtd">
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=gb2312">
<LINK href="../../css/style.css" rel=stylesheet type=text/css>
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
<SCRIPT language=javascript>
<!--
function admin_Size(num,objname)
{
	var obj=document.getElementById(objname)
	if (parseInt(obj.rows)+num>=3) {
		obj.rows = parseInt(obj.rows) + num;	
	}
	if (num>0)
	{
		obj.width="90%";
	}
}
//--> 
</SCRIPT>
<body>

<table border="0" cellspacing="1" cellpadding="3" align=center class="tableBorder"> 
  <tr> 
    <th height=25 colspan="2" class="tableHeaderText">网站HTML模板管理</th> 
  </tr> 
  <tr> 
    <td colspan="2" class="forumRowHighlight"><p><B>注意</B>：<BR> 
        ①在这里，您可以修改模板，可以编辑风格，操作时请按照相关页面提示完整填写表单信息。<BR> 
        ②执行删除时要慎重，任何的删除操作都是不可逆的。<br> </td> 
  </tr> 
  <tr>
 
	 <td width="17%" align="left" class="forumRowHighlight">操作选项：</td> 
     <td width="83%" align="left" class="forumRowHighlight"><a href="../index.asp">返回总类模板</a> | <a href="worldec_index.asp?id=<%=id%>">新闻一级分类模板</a> | <a href="worldec_detail.asp?id=<%=id%>">新闻详细模板</a> | [<a href="javascript:location.reload()">刷新页面</a>] </td>
  </tr> 
</table>
 
<form name="Form" action="?action=saveedit&id=<%=id%>" method=post> 
  <table border="0" cellspacing="1" cellpadding="3" align=center class="tableBorder"> 
    <tr> 
      <th class="tableHeaderText" colspan=2 height=25><font color="#FFFFFF">新闻模板一级分类风格管理</font></th> 
    </tr> 
    <tr>
      <td class="forumRowHighlight" height=30 align=left>模版名称：</td>
      <td class="forumRowHighlight" height=30 align=left><label>
        <input name="tempname"  onblur="this.value=this.value.replace(/\s/igm,'')" type="text" id="tempname" value="<%=tempname%>" size="30" maxlength="50">
      </label></td>
    </tr>
     
	<tr> 
      <td class="forumRowHighlight" width=17% height=40 align=left>新闻一级分类模版：     </td> 
      <td class="forumRowHighlight" width=83% height=40 align=left>
      <input name="news_sort1" type="text" id="news_sort1" value="<%=News_sort1%>" size="60" maxlength="100">( <a href="<%=News_sort1%>" target="_blank">查看模版</a> )</td> 
    </tr> 
	 
    <tr> 
      <td height="25" colspan="2" align="center" class="forumRowHighlight"><input type="submit" name="B1" value="确定修改设置"></td> 
    </tr> 
  </table> 
</form> 

 
</body>
</html>
