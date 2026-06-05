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
 
	offname=Replace_Text(request.Form("offname"))
 	address=Replace_Text(request.Form("address"))
 	phone=Replace_Text(request.Form("phone"))
 	fax=Replace_Text(request.Form("fax"))
 	linkren=Replace_Text(request.Form("linkren"))
	email=Replace_Text(request.Form("email"))
	post=Replace_Text(request.Form("post"))
	
	action=Request.querystring("action")
	Set Rs=Server.Createobject("ADODB.RecordSet")
	
	if action="add" then
		Sql="Select * From benming_ch_Contact"
		Rs.open Sql,conn,1,3
		Rs.addnew
			Rs("offname")=offname
			Rs("address")=address
			Rs("phone")=phone
			Rs("fax")=fax
			Rs("linkren")=linkren
			Rs("email")=email
			Rs("post")=post
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
  <TH class=tableHeaderText colSpan=2 height=25>添加办事处联系信息</TH>
<TR><tr><td height=85 valign=top class=forumRow><div align=center><br><br>
添加办事处联系信息成功！<br>
<br>
<a href="Offices_add.asp">继续添加
</a></div></td></tr><tr align=center><td height=30 class=forumRowHighlight><a href='Offices.asp'>&lt;&lt; 返回</a></td></tr></table><br>

</body>
</html>
<%
	elseif action="save" then
		id=request.form("hidid")
		Sql="Select * From benming_ch_Contact where id="&id
		Rs.open Sql,Conn,1,3
		Rs("offname")=offname
			Rs("address")=address
			Rs("phone")=phone
			Rs("fax")=fax
			Rs("linkren")=linkren
			Rs("email")=email
			Rs("post")=post
		Rs.update
		Rs.close
		Set rs=nothing
%>
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=gb2312">
<title>操作成功</title>
<link rel="stylesheet" type="text/css" href="../../css/style.css">
</head>
<body>
<table cellpadding=2 cellspacing=1 border=0 width=400 class=tableBorder align=center><TR>
  <TH class=tableHeaderText colSpan=2 height=25>修改办事处联系信息</TH>
<TR><tr><td height=85 valign=top class=forumRow><div align=center><br><br>
修理办事处联系信息成功！<br>
<br>
</div></td></tr><tr align=center><td height=30 class=forumRowHighlight><a href='Offices.asp'>&lt;&lt; 返回</a></td></tr></table><br>

</body>
</html>
<%
elseif action="del" then
	id=Request.querystring("id")
	Sql="Delete from benming_ch_Contact where id="&id
	Conn.execute(Sql)
%>
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=gb2312">
<title>操作成功</title>
<link rel="stylesheet" type="text/css" href="../../css/style.css">
</head>
<body>
<table cellpadding=2 cellspacing=1 border=0 width=400 class=tableBorder align=center><TR>
  <TH class=tableHeaderText colSpan=2 height=25>删除办事处信息</TH>
<TR><tr><td height=85 valign=top class=forumRow><div align=center><br><br>
删除办事处信息成功！<br>
<br>
</div></td></tr><tr align=center><td height=30 class=forumRowHighlight><a href='Offices.asp'>&lt;&lt; 返回</a></td></tr></table><br>

</body>
</html>
<%
end if
Conn.close
Set Conn=nothing
%>