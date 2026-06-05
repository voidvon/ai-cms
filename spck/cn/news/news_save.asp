<% data_path="../../../" 'ACC连接数据库路径，对SQL无效 %>
<!--#include file="../../../conn/conn.asp"-->
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
 	if trim(ins)="04" then 
 		ishavegant=true
 	end if
 next 
 if ishavegant=false then
	 response.redirect "../../err.asp"
 	response.end
 end if
 '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^End
 IncludePic=Request.Form("IncludePic")'标题分类(图片，推荐，注意..)
 title=Request.form("title")'标题
 if Replace_Text(trim(title))=""  then
 	response.write"<SCRIPT language=JavaScript>alert('您没有填写新闻标题，请返回重新填写！');"
	response.write"javascript:history.go(-1)</SCRIPT>"
	response.end
 end if
 typeid=Request.Form("typeid")'文章分类id
 if typeid="" then
 	response.write"<SCRIPT language=JavaScript>alert('您没有选择分类，请返回重新填写！');"
	response.write"javascript:history.go(-1)</SCRIPT>"
	response.end
 end if
 
 picture=Request.form("picture")'是否上传图片
 
 tjhome=Request.Form("tjhome")'首页推荐
 key=Request.Form("key")'文章关键字
 desc=Request.Form("desc")'文章描述
 content=Request.form("content")'文章内容
 
 action=Request.querystring("action")
 Set Rs=Server.Createobject("ADODB.RecordSet")
 
 if action="add" then
 	Sql="Select * From benming_ch_news"
	Rs.open Sql,conn,1,3
	Rs.addnew
		Rs("title")=Replace_Text(trim(IncludePic))&Replace_Text(Trim(title))
		Rs("typeid")=typeid
		if tjhome=1 then 
			tjhome=1
		else
			tjhome=0
		end if
		Rs("tjhome")=tjhome
		Rs("key")=Replace_Text(trim(key))
		Rs("desc")=Replace_Text(trim(desc))
		Rs("content")=content
		if picture="" then 
			picture="/UploadFile/nopicture.gif"
		else
			picture="/UploadFile/Newsuppic/"&picture
		end if
		Rs("picture")=picture
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
  <TH class=tableHeaderText colSpan=2 height=25>添加新闻</TH>
<TR><tr><td height=85 valign=top class=forumRow><div align=center><br><br>
添加新闻成功！<br>
<br>
<a href="News_add.asp">继续添加
</a></div></td></tr><tr align=center><td height=30 class=forumRowHighlight><a href='News_index.asp'>&lt;&lt; 返回</a></td></tr></table><br>

</body>
</html>
<%
elseif action="save" then
	newsid=Request.Form("hidid")
	newpic=picture '新上传的图片
	oldpic=Request.Form("oldpic")'原来的图片
	
	Sql="Select * From benming_ch_news where newsid="&newsid
	Rs.open Sql,conn,1,3
	
		Rs("title")=Replace_Text(trim(IncludePic))&Replace_Text(Trim(title))
		Rs("typeid")=typeid
		if tjhome=1 then 
			tjhome=1
		else
			tjhome=0
		end if
		Rs("tjhome")=tjhome
		Rs("key")=Replace_Text(trim(key))
		Rs("desc")=Replace_Text(trim(desc))
		Rs("content")=content
		
		if Replace_Text(Request("cimg"))=1 then
  		 '删除新上传的而又不使用的图片^^^^^^^^^^^^^^^^^^ 
   		 	if newpic<>oldpic then
 	 			call FileDel("/UploadFile/Newsuppic/"&newpic)
 			end if
   '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
 		end if
		
  		if Replace_Text(Request("cimg"))=2 then
     		rs("Picture")="/UploadFile/Newsuppic/"&newpic
   		'删除原有图片^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
   	 			if newpic<>oldpic then
	 				if olpic<>"/UploadFile/nopicture.gif" then
						
  	 					call FileDel(oldpic)
				 	end if
 				end if
   '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
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
  <TH class=tableHeaderText colSpan=2 height=25>修理新闻</TH>
<TR><tr><td height=85 valign=top class=forumRow><div align=center><br><br>
修理新闻成功！<br>
<br>
</div></td></tr><tr align=center><td height=30 class=forumRowHighlight><a href='News_index.asp'>&lt;&lt; 返回</a></td></tr></table><br>

</body>
</html>
		<%


end if

 Conn.close
 Set Conn=nothing
 %>