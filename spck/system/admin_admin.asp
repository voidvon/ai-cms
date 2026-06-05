<% data_path="../../" 'ACC连接数据库路径，对SQL无效 %>
<!--#include file="../../conn/conn.asp"-->
<!--#include file="../../inc/safe.asp"-->
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
%>
<LINK href="../css/style.css" rel=stylesheet type=text/css> 
<%
set rs=server.createobject("adodb.recordset") 
sql="select * from benming_master order by ID"
rs.open sql,conn,1,1 
msg_per_page=20 '定义每页显示记录条数
%>
<!--#include file="../../inc/headpage.asp"-->
<Form name="search" method="POST" action="admin_admin.asp">
<TABLE border=0 align="center" cellPadding=2 cellSpacing=1 class="tableBorder">
  <tr> 
     <th height=25 colspan="4" class="tableHeaderText">系统后台管理员管理 </th> 
  </tr> 
    <tr>
      <td colspan="4">
        <%
if rs.eof then
response.Write"<br><br><div align='center'>暂无数据信息</div><br><br>"
else
%>
      </td>
    </tr>
<TR height=28> 
<TD width="18%" align="center" class=bodytitle><font color="ff6600"><b>用户名</b></font></td>
<TD width="32%" align="center" class=bodytitle><font color="ff6600"><b>最后登录时间</b></font></td>
<TD width="35%" align="center" class=bodytitle><font color="ff6600"><b>最后登录IP</b></font></td>
<TD width="15%" align="center" class=bodytitle><font color="ff6600"><b>操作选项</b></font></td>
</TR>
    <%
do while not rs.eof and rowcount > 0%>
<TR height="28"> 
<TD width="18%" align="center" class=forumRow><a href="admin_admin_ok.asp?id=<%=rs("id")%>"><%=rs("username")%></a>　</td>
<TD width="32%" align="center" class=forumRow><%=rs("LastLogin")%>　</td>
<TD width="35%" align="center" class=forumRow><%=rs("LastLoginIP")%>　</td>
<TD width="15%" align="center" class=forumRow><a	href="admin_admin.asp?action=del&id=<%=rs("id")%>" onclick="{if(confirm('删除后该管理员将不可进入后台！\n\n确定删除吗?')){return true;}return false;}">删除</a>&nbsp;&nbsp;<a	href="admin_admin_ok.asp?id=<%=rs("id")%>">编辑权限</a></td>
</TR>
    <%
icolor=icolor+1
if icolor>1 then icolor=0
rowcount=rowcount-1
rs.movenext
loop
end if
%>
<TR><TD colspan="4" align="center"><b><%=listPages("admin_admin.asp")%></b></TD></TR>
</TABLE>
<%
if request("action")="del" then
	set rs=server.createobject("adodb.recordset")
	sql="delete from [benming_master] where id="&Request("id")
	conn.execute sql
	if err.Number<>0 then
		err.clear
		response.write "删 除 失 败 !<br>"
	else
		response.write"<SCRIPT language=JavaScript>alert('删除管理员成功');"
		response.write"this.location.href='admin_admin.asp';</SCRIPT>"
		response.end
	end if
end if
%>
<br>
