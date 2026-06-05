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
 	if trim(ins)="09" then 
 		ishavegant=true
 	end if
 next 
 if ishavegant=false then
	 response.redirect "../../err.asp"
 	response.end
 end if
%>
<LINK href="../../css/style.css" rel=stylesheet type=text/css> 
<%
set rs=server.createobject("adodb.recordset") 
sql="select * from benming_ch_job order by date desc"
rs.open sql,conn,1,1 
msg_per_page=20 '定义每页显示记录条数
%>
<!--#include file="../../../inc/headpage.asp"-->
<Form name="search" method="POST" action="admin_admin.asp">
<TABLE border=0 align="center" cellPadding=2 cellSpacing=1 class="tableBorder">
  <tr> 
     <th height=25 colspan="6" class="tableHeaderText">企业招聘管理 </th> 
  </tr> 
    <tr>
      <td colspan="6">
        <%
if rs.eof then
response.Write"<br><br><div align='center'>暂无数据信息</div><br><br>"
else
%>      </td>
    </tr>
<TR height=28> 
<TD width="35%" align="center" class=bodytitle><font color="ff6600"><b>职位信息</b></font></td>
<TD width="12%" align="center" class=bodytitle><font color="ff6600"><b>状态</b></font></td>
<TD width="11%" align="center" class=bodytitle><font color="ff6600"><b>招聘人数</b></font></td>
<TD width="14%" align="center" class=bodytitle><font color="ff6600"><b>地区</b></font></td>
<TD width="11%" align="center" class=bodytitle><font color="ff6600"><b>发布日期</b></font></td>
<TD width="17%" align="center" class=bodytitle><font color="ff6600"><b>操作选项</b></font></td>
</TR>
    <%
do while not rs.eof and rowcount > 0%>
<TR height="28"> 
<TD width="35%" align="center" class=forumRow><a href="admin_admin_ok.asp?id=<%=rs("id")%>"><%=rs("jobName")%></a>　</td>
<TD width="12%" align="center" class=forumRow><% if rs("state")=1 then response.write "发布中" else response.write "暂停发布" end if%>　</td>
<TD width="11%" align="center" class=forumRow><%=rs("jobnob")%></td>
<TD width="14%" align="center" class=forumRow><%=rs("address")%></td>
<TD width="11%" align="center" class=forumRow><%=rs("date")%></td>
<TD width="17%" align="center" class=forumRow><a	href="job.asp?action=del&id=<%=rs("id")%>" onclick="{if(confirm('删除后该信息将不可恢复！\n\n确定删除吗?')){return true;}return false;}">删除</a>&nbsp;&nbsp;<a	href="job_edit.asp?id=<%=rs("id")%>">编辑</a></td>
</TR>
    <%
icolor=icolor+1
if icolor>1 then icolor=0
rowcount=rowcount-1
rs.movenext
loop
end if
%>
<TR><TD colspan="6" align="center"><b><%=listPages("job.asp")%></b></TD></TR>
</TABLE>
<%
if request("action")="del" then
	set rs=server.createobject("adodb.recordset")
	sql="delete from [benming_ch_job] where id="&Request("id")
	conn.execute sql
	if err.Number<>0 then
		err.clear
		response.write "删 除 失 败 !<br>"
	else
		response.write"<SCRIPT language=JavaScript>alert('删除招聘信息成功');"
		response.write"this.location.href='job.asp';</SCRIPT>"
		response.end
	end if
end if
%>
<br>
