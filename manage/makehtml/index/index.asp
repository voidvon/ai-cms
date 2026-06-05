<% data_path="../../../" 'acc连接数据库路径，对sql无效 %>
<!--#include file="../../../conn/conn.asp"-->
<!--#include file="../../../inc/filesystem.asp"-->
<!--#include file="../../../inc/safe.asp"-->
<!--#include file="../kernel/temp_inc.asp"-->
<%
if request.cookies("masterflag")="" or request.cookies("masterflag")="" then
	response.write "<script language='javascript'>"
	response.write"parent.location.href='../../../admin/login.asp';</script>" 
	response.end
end if
 

'权限限制^^^^^^^^^^^^^^^^^^^^
 dim ishavegant
 ishavegant=false
 in_str=split(request.cookies("masterflag"),",")
 for each ins in in_str
 if trim(ins)="010" then 
 ishavegant=true
 end if
 next 
 if ishavegant=false then
 response.redirect "../../../admin/err.asp"
 response.end
 end if
 
 action=request.querystring("act")
 if action<>"" then
 	set rs=server.createobject("adodb.recordset")
		rs.open ("select home_index,co_index,produts_index,news_index,msg_index,contact from benming_ch_worldec_temp where selected=1"),conn,1,1
	if rs.eof then
		response.write("<br><br>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<font color=red>对不起！该模版不存在！</font><a href='#' onclick='javascript:history.back(-1);'>返回</a>")
	response.end()
	end if
	if not rs.eof then 
		select case action
			case "index"
				which_page="/index.html"               '生成的网站首页文件名(或路径)
				code_index=rs("home_index")               '模版内容
			case "contact"
				which_page="/contact.html"               '生成的网站联系我们文件名(或路径)
				code_index=rs("contact")    
			case "msg"
				which_page="/msg.html"               '生成的网站联系我们文件名(或路径)
				code_index=rs("msg_index")    
			case "search"
				which_page="/search.asp"
				code_index="/templets/blue/search.htm"
			case else
		end select
		rs.close
		set rs=nothing
		end if
		
		'处理生成页面^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ 
		set fso = yxfso
		'取模板内容
		set sort_save=fso.opentextfile(server.mappath(code_index))  
		web_str=sort_save.readall  
		sort_save.close 
		 
		'替换标签生成html页^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ 
		str=hope_htmlresult(web_str)
		
		set sort_save = fso.createtextfile(server.mappath(which_page))
		sort_save.write str
		sort_save.close
		'^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ 
		   response.write "<br><br>生成完毕。<a href="&which_page&" target=blank><font color=red>点击查看</font></a>&nbsp;&nbsp;<a href=index.asp>返回</a>"
		conn.close
		set conn=nothing
 else
%>
<html>
	<head>
	<meta http-equiv="content-type" content="text/html; charset=gb2312">
	<title>生成各大栏目首页</title>
	<style type="text/css">
	<!--
	body {
		margin-left: 0px;
		margin-top: 0px;
		margin-right: 0px;
		margin-bottom: 0px;
		background-color: #e4edf9;
	}
	body,td,th {font-size: 12px;}
	
	a:link{
	text-decoration: none;
	color: #000000;
	font-size: 12px;
}
	a:visited{
	text-decoration: none;
	color: #000000;
	font-size: 12px;
}
	a:hover{
	text-decoration: underline;
	color: #ffffff;
	font-weight: bold;
	font-size: 12px;
}
	a:active{
	text-decoration: none;
	font-size: 12px;
}
	-->
	</style>
	</head>
<body>
	<table width="100%" border="0">
	<tr><td colspan="8" height="30" align="center"><br><font style="font-size:14px; font-weight:bold">生成各首页静态页面操作</font>：请点击相关项进行生成操作！</td></tr>
	<tr><td colspan="8" height="30"></td></tr>
	  <tr bgcolor="#fdfeff">
		<td width="25%" height="35" align="center" onmouseover="this.style.backgroundcolor='#87d2fc'"   onmouseout="this.style.backgroundcolor='#fdfeff'"><a href="?act=index" >生成网站首页</a></td>
		
		<td width="25%" height="35" align="center" onmouseover="this.style.backgroundcolor='#87d2fc'"   onmouseout="this.style.backgroundcolor='#fdfeff'"><a href="?act=contact" >生成联系我们</a></td>
	    <td width="25%" height="35" align="center" onmouseover="this.style.backgroundcolor='#87d2fc'"   onmouseout="this.style.backgroundcolor='#fdfeff'"><a href="?act=msg">生成在线留言</a></td>
	    <td width="25%" align="center" onmouseover="this.style.backgroundcolor='#87d2fc'"   onmouseout="this.style.backgroundcolor='#fdfeff'">&nbsp;<a href="?act=search">生成搜索</a></td>
	  </tr>
		<tr>
		<td colspan="8" height="30"></td>
		</tr>
		
	  <tr>
		<td colspan="8" height="50" align="center"><a href="#" onclick="javascript:history.back(-1);">返回</a></td>
		</tr>
	  
	  	<tr>
		<td colspan="8" height="50"></td>
		</tr>
</table>
<%end if%>

