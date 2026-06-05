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
 
 strtypename=Replace_Text(request.Form("typename"))
 meta_keywords=Replace_Text(request.Form("meta_keywords"))
 meta_descriptions=Replace_Text(request.Form("meta_descriptions"))
 title=Replace_Text(request.Form("title"))
 action=request.QueryString("action")

 set Rs=Server.CreateObject("ADODB.RecordSet")
 if action="add" then
 	Sql="Select * from benming_ch_MetaType"
	Rs.open Sql,Conn,1,3
	Rs.addnew
		Rs("typename")=strtypename
		Rs("meta_keywords")=meta_keywords
		Rs("meta_descriptions")=meta_descriptions
		Rs("title")=title
	Rs.update
%>
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=gb2312">
<title>操作成功</title>
<link rel="stylesheet" type="text/css" href="../../css/style.css">
</head>
<body>
<table cellpadding=2 cellspacing=1 border=0 width=400 class=tableBorder align=center><TR>
  	<TH class=tableHeaderText colSpan=2 height=25>添加页面关键字成功</TH>
	<TR>
		<tr>
			<td height=85 valign=top class=forumRow>
				<div align=center>
					<br><br>
					添加页面关键字成功！
					<br><br>
					<a href="Meta_keywords_add.asp">继续添加</a>
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
<%
  elseif action="edit" then
  	id=request.Form("hidid")
 	Sql="Select * from benming_ch_MetaType where id="&id
	Rs.open Sql,conn,1,3
		Rs("typename")=strtypename
		Rs("meta_keywords")=meta_keywords
		Rs("meta_descriptions")=meta_descriptions
		Rs("title")=title
	Rs.update
%>
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=gb2312">
<title>操作成功</title>
<link rel="stylesheet" type="text/css" href="../../css/style.css">
</head>
<body>
<table cellpadding=2 cellspacing=1 border=0 width=400 class=tableBorder align=center><TR>
  	<TH class=tableHeaderText colSpan=2 height=25>修改页面关键字成功</TH>
	<TR>
		<tr>
			<td height=85 valign=top class=forumRow>
				<div align=center>
					<br><br>
					修改页面关键字成功！
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
<%
 end if
 
 Rs.close
 Set Rs=nothing
 Conn.close
 Set Conn=nothing
 
 

 %>