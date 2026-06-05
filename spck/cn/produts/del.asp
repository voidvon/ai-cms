<% data_path="../../../" 'ACC连接数据库路径，对SQL无效 %>
<!--#include file="../../../conn/conn.asp"-->
<!--#include file="../function.asp"-->
<!--#include file="../../../inc/filesystem.asp"-->
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
	if trim(ins)="05" then 
 		ishavegant=true
 	end if
next 
if ishavegant=false then
	response.redirect "../../err.asp"
 	response.end
end if

if request.QueryString("action")="del" then
	id=request.querystring("id")
	Sql="select count(*) from benming_ch_ProdCat where root="&id
	set Rs=Server.CreateObject("ADODB.recordSet")
	Rs.open Sql,Conn,1,1
	if Rs(0)>0 then
		Call Operation("请先删除分类下的小类",0)
		response.End()
	else
		Call FSO_Del(GetprodutsDir(id))
		sql="delete from benming_ch_ProdCat where id="&id
		Conn.execute(sql)
	end if
	
%>
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=gb2312">
<title>操作成功</title>
<link rel="stylesheet" type="text/css" href="../../css/style.css">
</head>
<body>
<table cellpadding=2 cellspacing=1 border=0 width=400 class=tableBorder align=center><TR>
  <TH class=tableHeaderText colSpan=2 height=25>删除分类</TH>
	<tr>
		<td height=85 valign=top class=forumRow>
			<div align=center>
				<br>
				<br>
				删除分类成功！
				<br>
				<br>
			
			</div>
		</td>
	</tr>
	<tr align=center>
		<td height=30 class=forumRowHighlight><a href='prodcat.asp'> << 返回上一页</a></td>
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