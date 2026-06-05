<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=gb2312">
<LINK href="css/style.css" rel=stylesheet type=text/css>
<title>后台登陆验证</title>
<%data_path="../"%>
<!--#include file="../conn/conn.asp"-->
<!--#include file="../inc/md5.asp"-->
<!--#include file="../inc/safe.asp"-->
<%
if Not ChkPost then response.redirect ("chklogin.asp?login=1")
Response.Expires = 0
Response.AddHeader "Pragma", "no-cache"
Response.AddHeader "cache-control", "no-store"
  
'^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
dim uid,upwd
uid=Replace_Text(Request.Form("userid"))
upwd=md5(Replace_Text(Request.Form("password")),16)
Verifycode=Replace_Text(request.Form("verifycode"))
 
 if not isnumeric(Verifycode) then
	Call Logerr()
	Call  ErroFy()
 end if


if Cint(Verifycode)<>Session("SafeCode") then
	Call  ErroFy()
	Sub ErroFy()
		response.write"<table cellpadding=2 cellspacing=1 border=0 width=100% class=tableBorder align=center>"
		response.write"<TR>"
		response.write"<TH class=tableHeaderText colSpan=2 height=25>出现错误提示</TH>"
		response.write"<TR><tr><td height=85 valign=top class=forumRow><div align=center><br><br>验证码错误！</div></td></tr>"
		response.write"<tr align=center><td height=30 class=forumRowHighlight><a href='login.asp'>&lt;&lt; 返回上一页</a></td>"
		response.write"</tr>"
		response.write"</table>"
		Response.End()
	End Sub
else

	Set rs=server.createobject("adodb.recordset")
	sqltext="select * from benming_master where Username='" & uid & "' and [PassWord]='" & upwd & "'"
	rs.open sqltext,conn,1,1
	If Rs.Eof And Rs.Bof Then

		response.write"<table cellpadding=2 cellspacing=1 border=0 width=100% class=tableBorder align=center>"
		response.write"<TR>"
		response.write"<TH class=tableHeaderText colSpan=2 height=25>出现错误提示</TH>"
		response.write"<TR><tr><td height=85 valign=top class=forumRow><div align=center><br><br>登陆名或密码不正确！</div></td></tr>"
		response.write"<tr align=center><td height=30 class=forumRowHighlight><a href='login.asp'>&lt;&lt; 返回上一页</a></td>"
		response.write"</tr>"
		response.write"</table>" 
		
	else

   		Response.Cookies("globalecmaster")=rs("username")
   		Response.Cookies("masterflag")=rs("flag")
   		Response.Cookies("adminid")=rs("id")

   		LastLogin=Date()
		LastLoginIP=getIP()
		sql="update benming_master set LastLogin='"&LastLogin&"',LastLoginIP='"&LastLoginIP&"' where username='"&uid&"'"
		
   		conn.execute(sql)
		response.write"<table cellpadding=2 cellspacing=1 border=0 width=100% class=tableBorder align=center>"
		response.write"<TR>"
		response.write"<TH class=tableHeaderText colSpan=2 height=25>登陆成功提示</TH>"
		response.write"<TR><tr><td height=85 valign=top class=forumRow><div align=center><br><br>成功通过网站后台管理员身份认证！<br><br>2秒后自动进入后台...</div></td></tr>"
		response.write"<tr align=center><td height=30 class=forumRowHighlight><a href='index.asp'>进入后台管理</a></td>"
		response.write"</tr>"
		response.write"</table>"
%>
<meta HTTP-EQUIV=refresh Content='2;url=index.asp'>
<%
	end if
	rs.close
	set rs=nothing
end if



Private Function getIP()
	Dim strIPAddr
	If Request.ServerVariables("HTTP_X_FORWARDED_FOR") = "" OR InStr(Request.ServerVariables("HTTP_X_FORWARDED_FOR"), "unknown") > 0 Then
	strIPAddr = Request.ServerVariables("REMOTE_ADDR")
	ElseIf InStr(Request.ServerVariables("HTTP_X_FORWARDED_FOR"), ",") > 0 Then
	strIPAddr = Mid(Request.ServerVariables("HTTP_X_FORWARDED_FOR"), 1, InStr(Request.ServerVariables("HTTP_X_FORWARDED_FOR"), ",")-1)
	ElseIf InStr(Request.ServerVariables("HTTP_X_FORWARDED_FOR"), ";") > 0 Then
	strIPAddr = Mid(Request.ServerVariables("HTTP_X_FORWARDED_FOR"), 1, InStr(Request.ServerVariables("HTTP_X_FORWARDED_FOR"), ";")-1)
	Else
	strIPAddr = Request.ServerVariables("HTTP_X_FORWARDED_FOR")
	End If
	getIP = Trim(Mid(strIPAddr, 1, 30))
End Function

%>
<br>


