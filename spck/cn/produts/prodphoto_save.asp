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
 	if trim(ins)="06" then 
 		ishavegant=true
 	end if
 next 
 if ishavegant=false then
	 response.redirect "../../err.asp"
 	response.end
 end if
 
 
photoName=request.form("photoName")
picture=request.form("picture")


if request.QueryString("action")="add" then
	Set Rs=Server.Createobject("ADODB.RecordSet")
	Sql="Select * from benming_ch_prodphoto"
	Rs.open Sql,conn,1,3
	Rs.addnew
		rs("photoName")=trim(photoName)
		rs("photopic")=picture
	Rs.update
	Rs.close
	set Rs=nothing
%>
 <html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=gb2312">
<title>操作成功</title>
<link rel="stylesheet" type="text/css" href="../../css/style.css">
</head>
<body>
<table cellpadding=2 cellspacing=1 border=0 width=400 class=tableBorder align=center><TR>
  <TH class=tableHeaderText colSpan=2 height=25>添加图片</TH>
<TR><tr><td height=85 valign=top class=forumRow><div align=center><br><br>
添加图片成功！<br>
<br>
<a href="prodphoto_add.asp">继续添加
</a></div></td></tr><tr align=center><td height=30 class=forumRowHighlight><a href='prodphoto.asp'>&lt;&lt; 返回</a></td></tr></table><br>

</body>
</html>

	<%
end if
conn.close
set conn=nothing
%>