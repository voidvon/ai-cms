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
	if trim(ins)="03" then 
 		ishavegant=true
 	end if
next 
if ishavegant=false then
	response.redirect "../../err.asp"
 	response.end
end if


	
if request.querystring("action")="add" then
	Sql="Select * from benming_ch_Cocat"
	Set Rs=Server.CreateObject("ADODB.Recordset")
	Rs.open Sql,conn,1,3
	Rs.addnew
		Rs("coname")=Request.form("coname")
		Rs("OrderID")=Request.form("OrderID")
		Rs("root")=request.Form("root")
		if request.Form("sitepath")=1 then
			Rs("sitepath")=1
			Rs("siteurl")=Replace_Text(Request.Form("siteurl"))
		else
			Rs("sitepath")=0
			Rs("siteurl")=""
		end if
	Rs.update
	Rs.Close
	Set Rs=nothing
%>
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=gb2312">
<title>操作成功</title>
<link rel="stylesheet" type="text/css" href="../../css/style.css">
</head>
<body>
<table cellpadding=2 cellspacing=1 border=0 width=400 class=tableBorder align=center><TR>
  <TH class=tableHeaderText colSpan=2 height=25>添加公司分类</TH>
	<tr>
		<td height=85 valign=top class=forumRow>
			<div align=center>
				<br>
				<br>
				添加网站配置分类成功！
				<br>
				<br>
				<a href="Co_Class_add.asp">继续添加</a>
			</div>
		</td>
	</tr>
	<tr align=center>
		<td height=30 class=forumRowHighlight><a href='Co_Class.asp'> << 返回上一页</a></td>
	</tr>
</table>
<br>
</body>
</html>
<%
elseif request.QueryString("action")="edit" then
	id=request.form("hidid")
	hidurl=request.Form("hidurl")
	
	Sql="Select * from benming_ch_Cocat where id="&id
	Set Rs=Server.CreateObject("ADODB.Recordset")
	Rs.open Sql,conn,1,3
		Rs("coname")=Request.form("coname")
		Rs("OrderID")=Request.form("OrderID")
		Rs("root")=request.Form("root")
		if request.Form("sitepath")=1 then
			Rs("sitepath")=1
			Rs("siteurl")=Replace_Text(Request.Form("siteurl"))
		else
			Rs("sitepath")=0
			Rs("siteurl")=""
		end if
	Rs.update
	Rs.close
	Set Rs=nothing
%>
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=gb2312">
<title>操作成功</title>
<link rel="stylesheet" type="text/css" href="../../css/style.css">
</head>
<body>
<table cellpadding=2 cellspacing=1 border=0 width=400 class=tableBorder align=center><TR>
  <TH class=tableHeaderText colSpan=2 height=25>修改配置分类</TH>
	<tr>
		<td height=85 valign=top class=forumRow>
		<div align=center>
			<br>
			<br>
			修改配置分类成功！
			<br>
		</div>
		</td>
	</tr>
	<tr align=center>
		<td height=30 class=forumRowHighlight>
		 >> <a href="<%=hidurl%>">返回上一页</a>
		</td>
	</tr>
</table>
<br>

</body>
</html>
<%
end if
Conn.close
Set Conn=nothing
%>