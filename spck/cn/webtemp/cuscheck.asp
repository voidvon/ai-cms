<% data_path="../../../" 'ACC连接数据库路径，对SQL无效 %>
<!--#include file="../../../conn/conn.asp"-->
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
 	if trim(ins)="010" then 
 		ishavegant=true
 	end if
 next 
 if ishavegant=false then
	 response.redirect "../../../err.asp"
 	response.end
 end if
 %>
<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN"
"http://www.w3.org/TR/html4/loose.dtd">
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=gb2312">

<style type="text/css">
<!--
body {
	margin-left: 0px;
	margin-top: 0px;
	margin-right: 0px;
	margin-bottom: 0px;
}
.style1 {
	font-size: 16px;
	font-weight: bold;
	color: #FF0000;
}
-->
</style></head>

<body>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">

<LINK href="../css/style.css" rel=stylesheet type=text/css>
<%
str="#"&request.QueryString("str")&"#"
sql="select * from benming_ch_cuslabel where lname='"&str&"'"

Set Rs=server.CreateObject("adodb.recordset")
rs.open sql,conn,1,1
if rs.eof and rs.bof then
	blyou="有效,请使用!"
else
	blyou="无效,请换一个!"
end if
rs.close
set rs=nothing
conn.close
set conn=nothing
%>
<table border="0" cellpadding="0" cellspacing="0" width="60%"  align="center"><tr><td height="20"></td></tr><tr><td align="center" valign="middle"><font color="red"><b>自定义标签名称检测</b></font></td></tr><tr><td><br />
名称：
<font color="#0099CC"><b><%=str%></b></font><br />

</td></tr><tr><td height="35">结果：<font color=red><%=blyou%></font></td></tr>
<tr><td height="50" align="center"><a href="#" onClick="javascript:window.close();">关闭</a></td></tr>
</table>
</body>
</html>

