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

typeid=request.Form("typeid")
prodName=request.Form("prodName")
prodCode=Request.form("prodCode")

smallpic=request.Form("magicfacepic1") '^^^产品小图
bigpic=request.Form("magicfacepic2")
if smallpic="" then
	smallpic="/skin/dfpic.gif"
end if
if bigpic="" then
	bigpic="/skin/dfpic.gif"
end if
key=request.Form("key")
desc=request.Form("desc")
content=request.Form("content")
tjhome=request.Form("tjhome")
show=request.Form("show")
orderid=request.form("orderid")

Set Rs=Server.Createobject("ADODB.RecordSet")

if request.QueryString("action")="add" then
	Sql="Select * from benming_ch_prod"
	Rs.open Sql,conn,1,3
	Rs.addnew
		rs("prodName")=trim(prodName)
		rs("prodCode")=prodCode
		rs("CatId")=typeid
		rs("remark")=desc
		rs("itemize")=content
		rs("smallpic")=smallpic
		rs("bigpic")=bigpic
		rs("key")=key
		if tjhome="" then
			tjhome=0
		else
			tjhome=1
		end if
		rs("tjhome")=tjhome
		if show="" then
			show=1
		else
			show=0
		end if
		Rs("show")=show
		Rs("orderid")=orderid
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
  <TH class=tableHeaderText colSpan=2 height=25>添加产品</TH>
<TR><tr><td height=85 valign=top class=forumRow><div align=center><br><br>
添加产品成功！<br>
<br>
<a href="prod_add.asp">继续添加
</a></div></td></tr><tr align=center><td height=30 class=forumRowHighlight><a href='prod.asp'>&lt;&lt; 返回</a></td></tr></table><br>

</body>
</html>
<%
elseif request.QueryString("action")="save" then
	id=request.form("hidid")
	Sql="Select * from benming_ch_prod where id="&id
	Rs.open Sql,conn,1,3
		rs("prodName")=trim(prodName)
		rs("prodCode")=prodCode
		rs("CatId")=typeid
		rs("remark")=desc
		rs("itemize")=content
		rs("smallpic")=smallpic
		rs("bigpic")=bigpic
		rs("key")=key
		if tjhome="" then
			tjhome=0
		else
			tjhome=1
		end if
		rs("tjhome")=tjhome
		if show="" then
			show=1
		else
			show=0
		end if
		Rs("show")=show
		Rs("orderid")=orderid
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
  <TH class=tableHeaderText colSpan=2 height=25>修改产品</TH>
<TR><tr><td height=85 valign=top class=forumRow><div align=center><br><br>
修改产品成功！<br>
</div></td></tr><tr align=center><td height=30 class=forumRowHighlight><a href='prod.asp'>&lt;&lt; 返回</a></td></tr></table><br>

</body>
</html>
	<%
end if
Conn.close
Set Conn=nothing
%>