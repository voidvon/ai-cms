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
 	if trim(ins)="09" then 
 		ishavegant=true
 	end if
 next 
 if ishavegant=false then
	 response.redirect "../../err.asp"
 	response.end
 end if
 
 
jobName=request.form("jobName")
address=request.Form("address")
jobnob=request.Form("jobnob")
linkren=request.Form("linkren")
phone=request.Form("phone")
if request.Form("state")="" then
	state1=0
else
	state1=request.Form("state")
end if
content=request.Form("content")
date1=date()

Set Rs=Server.createobject("ADODB.Recordset")
if request.QueryString("action")="add" then
	Sql="Select * from benming_ch_job"
	Rs.open Sql,Conn,1,3
	RS.addnew
		Rs("jobName")=jobName
		Rs("address")=address
		Rs("jobnob")=jobnob
		Rs("linkren")=linkren
		Rs("phone")=phone
		Rs("state")=state1
		Rs("jobneed")=content
		Rs("date")=date1
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
  <TH class=tableHeaderText colSpan=2 height=25>发布招聘信息</TH>
<TR><tr><td height=85 valign=top class=forumRow><div align=center><br><br>
发布招聘信息成功！<br>
<br>
<a href="job_add.asp">继续添加
</a></div></td></tr><tr align=center><td height=30 class=forumRowHighlight><a href='job.asp'>&lt;&lt; 返回</a></td></tr></table><br>

</body>
</html>
<%
elseif request.QueryString("action")="Save" then
	id=request.Form("hidid")
	Sql="Select * from benming_ch_job where id="&id

	Rs.open Sql,Conn,1,3
		Rs("jobName")=jobName
		Rs("address")=address
		Rs("jobnob")=jobnob
		Rs("linkren")=linkren
		Rs("phone")=phone
		Rs("state")=state1
		Rs("jobneed")=content
		
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
  <TH class=tableHeaderText colSpan=2 height=25>修改招聘信息</TH>
<TR><tr><td height=85 valign=top class=forumRow><div align=center><br><br>
修改招聘信息成功！<br>
<br>
</div></td></tr><tr align=center><td height=30 class=forumRowHighlight><a href='job.asp'>&lt;&lt; 返回</a></td></tr></table><br>

</body>
</html>
<%
end if
conn.close
set conn=nothing
%>