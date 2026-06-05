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
 	if trim(ins)="03" then 
 		ishavegant=true
 	end if
 next 
 if ishavegant=false then
	 	response.redirect "../../err.asp"
 		response.end
 end if
%>

<meta http-equiv="Content-Type" content="text/html; charset=gb2312">
<LINK href="../../css/style.css" rel=stylesheet type=text/css> 

<style type="text/css">
<!--
.STYLE1 {color: #FF0000}
-->
</style>
<table width="98%" border="0" cellspacing="0" cellpadding="0" align=center class="tableBorder"> 
  <tr> 
     <th height=25 colspan="2" class="tableHeaderText">公司信息分类</th> 
  </tr> 
  <tr> 
     <td colspan="2" class="forumRowHighlight"><p><B>注意</B>：<BR> 
         ①类别直接与发布的信息相关联，删除类别可能会影响到以前发布的公司信息。<BR> </td> 
  </tr> 
  
  <tr>
    <td width="26%" height=25 class="forumRowHighlight">&nbsp;</td>
	 <td class="forumRowHighlight"><a href="Offices.asp">管理办事处联系方式</a> | <a href="Offices_add.asp">添加办事处联系方式</a> | [<a href="javascript:location.reload()">刷新页面</a>] </td> 
  </tr> 
</table>

<Form name="search" method="POST" action="index.asp">
  <table wnewsidth="100%" border="0" align="center" cellpadding="2" cellspacing="1" class="tableBorder">
    <tr>
      <th class="tableHeaderText" height=25 colspan="4">新闻分类列表</th>
    <tr>
      <td colspan="4">      </td>
    </tr>
    <tr height=25 class=bodytitle>
      <td width="42%" align="left" class=bodytitle wnewsidth="446">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<font color="ff6600"><b>办事处名称</b></font></td>
      <td width="21%" align="center" class=bodytitle wnewsidth="446"><font color="ff6600"><b>联系人</b></font></td>
      <td width="16%" align="center" class=bodytitle wnewsidth="446"><font color="ff6600"><b>电话</b></font></td>
      <td width="21%" align="center" class=bodytitle wnewsidth="62"><font color="ff6600"><b>操作</b></font></td>
    </tr>
  <%
  Sql="select * from benming_ch_Contact"
  Set Rs=Server.CreateObject("ADODB.RecordSet")
  Rs.open Sql,Conn,1,1
  do while not Rs.eof
  %>
	 <tr height="20">
      <td align="left" class=forumRow> 
	  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<%=rs("offname")%></td>
      <td align="center" class=forumRow>&nbsp;<%=rs("linkren")%></td>
      <td align="center" class=forumRow>&nbsp;<%=Rs("phone")%></td>
      <td height="30" align="center" class=forumRow><a href="Offices_edit.asp?id=<%=rs("id")%>">修改</a> | <a href="Offices_save.asp?action=del&id=<%=rs("id")%>">删除</a> </td>
    </tr>
    
   <%
   	Rs.movenext
   loop
   %>
  </table>
</form>
<%
Rs.close
Set Rs=nothing

Conn.close
Set Conn=nothing
%>