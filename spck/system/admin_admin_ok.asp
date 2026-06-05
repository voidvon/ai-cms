<% data_path="../../" 'ACC连接数据库路径，对SQL无效 %>
<!--#include file="../../conn/conn.asp"-->
<!--#include file="../../inc/safe.asp"-->
<!--#include file="../../inc/md5.asp"-->
<!--#include file="menu.asp"-->
<%
if request.Cookies("masterflag")="" or request.Cookies("masterflag")="" then
	response.write "<script language='javascript'>"
	response.write"parent.location.href='../login.asp';</SCRIPT>" 
	response.end
end if

'权限限制^^^^^^^^^^^^^^^^^^^^
 dim ishavegant
 ishavegant=false
 in_str=split(request.Cookies("masterflag"),",")
 for each ins in in_str
 if trim(ins)="01" then 
 ishavegant=true
 end if
 next 
 if ishavegant=false then
 response.redirect "../err.asp"
 response.end
 end if
 
if Not ChkPost then response.redirect ("../chklogin.asp?login=4")
Response.Expires = 0
Response.AddHeader "Pragma", "no-cache"
Response.AddHeader "cache-control", "no-store"
%>
<script LANGUAGE="JavaScript">
function check()
{
if (document.Form1.username.value=="")
{
alert("请输入登陆名！")
document.Form1.username.focus()
document.Form1.username.select()
return
}
if (document.Form1.password.value=="")
{
alert("请输入密码！")
document.Form1.password.focus()
document.Form1.password.select() 
return
}
document.Form1.submit()
}
</SCRIPT>
<LINK href="../css/style.css" rel=stylesheet type=text/css> 
<body marginheight=0 marginwidth=0 leftmargin=0>
<%
if instr(request.Cookies("masterflag"),"01")=0 then
	Errmsg=Errmsg+"<br>"+"<li>本页面为管理员专用。<br><li>您没有管理本页面的权限。"
 	response.Write(Errmsg)
else
	call main()
	set rs=nothing
	conn.close
	set conn=nothing
end if

sub main()
%>
<center>
<table cellpadding=0 cellspacing=0 border=0 width=100% align=center>
<tr>
<td>
<table cellpadding=4 cellspacing=1 border=0 width=100%>
<tr>
<td width="100%" valign=top>
<%
if request("action")="editsave" then 
	call editsave()
elseif request("action")="add" then 
	
	call add2()
elseif request("action")="addsave" then 
	call addsave()
else
	call manager()
end if
%>
<p><%=body%></p>
</td>
</tr>
</table>
</td>
</tr>
</table>
<%
end sub

sub manager()
	dim sql
	dim rs
	dim id
	id=request("id")
	sql="select * from benming_master where id="&cstr(id)
	Set rs= Server.CreateObject("ADODB.Recordset")
	rs.open sql,conn,1,1
%>
<script language="JavaScript">
<!--
function CheckAll(form) {
	for (var i=0;i<form.elements.length;i++) {
	var e = form.elements[i];
	if (e.name != 'chkall') e.checked = form.chkall.checked; 
}
}
//-->
</script>
<TABLE border=0 cellPadding=0 cellSpacing=0 width="100%">
<TR>
<TD align="center">
<FORM action="admin_admin_ok.asp?action=editsave&id=<%=id%>" method="post" name="Form1">
<TABLE width=100% border="0" cellPadding=2 cellSpacing=1 class="tableBorder">
  <tr> 
     <th height=25 colspan="2" class="tableHeaderText">管理员管理－－修改管理员 </th> 
  </tr>
<TR> 
<TD width="17%" height="28" align="right" class=forumRow>用&nbsp;户&nbsp;名：</td>
<TD width="83%"><font color="#FFFFFF">&nbsp;&nbsp;<input type=text name=username size="35" class="smallInput" value=<%=rs("username")%>></font> <font color='#FF0000'>*</font></TD>
</TR>
<TR>
<TD align="right" height="28" class=forumRow>密&nbsp;&nbsp;&nbsp;&nbsp;码：</TD>
<TD><font color="#FFFFFF">&nbsp;&nbsp;<input type=password name=password size="40" class="smallInput" value=<%=rs("password")%>>
</font> <font color='#FF0000'>*</font></TD>
</TR>
<TR> 
<TD align="center" height="28" colspan=2 class=bodytitle><b>可 操 作 权 限 管 理</b></td>
</TR>
<TR>
<TD colspan=2>
<%
jj=rs("flag" )

for j=1 to ubound(menu)
	if isempty(menu(j)) then exit for
		
		menuname=menu(j)
		
		abc=HOPE_check(jj,"0"&j)
		if j=7 then response.Write("<Br/>")

%>
&nbsp;<input type="checkbox" name="flag" value="0<%=j%>" <%if abc=true then Response.write "Checked" %>><%=menuname%> 
&nbsp;&nbsp;
<%next%>
<br><br><hr  color="#F7F7F7" width="98%"  size="1">
</TD>
</TR>
<TR>
<TD colspan=2 height="28" align="center" class="forumRowHighlight"> 
  <input type="button" value="修 改" class="smallInput" onclick=check()>&nbsp;&nbsp;&nbsp;&nbsp;<input name=chkall type=checkbox value=on onclick=CheckAll(this.form)>选择所有权限</TD>
</TR>
</TABLE></FORM>
</TD>
</TR>
</TABLE>
<%
	rs.close
	set rs=nothing
end sub



sub editsave()
	set rs=server.createobject("adodb.recordset")
	sql="select * from benming_master where id="&request("id")
	rs.open sql,conn,3,3
	oldpassword=rs("password")
		rs("username")=request("username")
		rs("flag")=request("flag")
	
		if request("password")<>oldpassword then
			rs("password")=md5(request("password"),16)
		end if
	rs.update
	response.write "<script language='javascript'>"
	response.write "alert('管理员信息修改成功！');"
	response.write"this.location.href='admin_admin.asp';</SCRIPT>"
	response.end
end sub


sub add2()
%>
<script language="JavaScript">
<!--
function CheckAll(form) {
for (var i=0;i<form.elements.length;i++) {
var e = form.elements[i];
if (e.name != 'chkall') e.checked = form.chkall.checked; 
}
}
//-->
</script>
<TABLE border=0 cellPadding=0 cellSpacing=0 width="100%">
<TR>
<TD align="center">
<FORM action="admin_admin_ok.asp?action=addsave&id=<%=id%>" method="post" name="Form1">
<TABLE width=100% border="0" cellPadding=2 cellSpacing=1 class="tableBorder">
  <tr> 
     <th height=25 colspan="2" class="tableHeaderText">管理员管理－－添加管理员 </th> 
  </tr>
<TR> 
<TD width="17%" height="28" align="right" class=forumRow>用&nbsp;户&nbsp;名：</td>
<TD width="83%" class=forumRow><font color="#FFFFFF">&nbsp;&nbsp;<input type=text name=username size="35">
 </font> <font color='#FF0000'>*</font></TD>
</TR>
<TR>
<TD align="right" height="28" class=forumRow>密&nbsp;&nbsp;&nbsp;&nbsp;码：</TD>
<TD class=forumRow>&nbsp;&nbsp;<input type=password name=password size="40"> <font color='#FF0000'>*</font></TD>
</TR>
<TR> 
<TD align="center" height="28" colspan=2 class=bodytitle><b>可 操 作 权 限 管 理</b></td>
</TR>

<TR>
<TD colspan=2>
<%
for j=1 to ubound(menu)
	if isempty(menu(j)) then exit for
		menuname=menu(j)
		if j=7 then response.Write("<Br/>")
%>
&nbsp;<input type="checkbox" name="flag" value="0<%=j%>" <%if abc=true then Response.write "Checked" %>><%=menuname%> 
&nbsp;&nbsp;
<%next%></TD>
</TR>
<TR>
<TD height="28" colspan=2 align="center" class="forumRowHighlight"> 
  <input type="button" value="添 加" class="smallInput" onclick=check()>&nbsp;&nbsp;&nbsp;&nbsp;<input name=chkall type=checkbox value=on onclick=CheckAll(this.form)>选择所有权限</TD>
</TR>
</TABLE>
</FORM>
</TD>
</TR>
</TABLE>
<%
end sub

sub addsave()
set rs=server.createobject("adodb.recordset")
sql="select * from benming_master"
rs.open sql,conn,3,3
rs.addnew
rs("username")=request("username")
rs("password")=md5(request("password"),16)
rs("flag")=request("flag")
rs.update
response.write "<script language='javascript'>"
response.write "alert('管理员信息添加成功！');"
response.write"this.location.href='admin_admin.asp';</SCRIPT>"
response.end
end sub
%>
