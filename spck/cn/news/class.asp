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
 	if trim(ins)="04" then 
 		ishavegant=true
 	end if
 next 
 if ishavegant=false then
	 	response.redirect "../../err.asp"
 		response.end
 end if

if request.querystring("id")="" then
	Sql="Select * from benming_ch_NewsCat where root=0  order by orderid"
else
	Sql="Select * from benming_ch_NewsCat where root="&request.querystring("id")&"  order by orderid"
end if
set Rs=server.CreateObject("ADODB.Recordset")
Rs.open Sql,conn,1,1
msg_per_page=10

 %>
<!--#include file="../../../inc/Headpage.asp"-->
<meta http-equiv="Content-Type" content="text/html; charset=gb2312">
<LINK href="../../css/style.css" rel=stylesheet type=text/css> 
<script>
var checkflag="false";
function check(field){
	if(checkflag=="false"){
		for(i=0;i<field.length;i++){
			field[i].checked=true;}
			checkflag="true";
			return "解除全选"; }
	else {
		for(i=0;i<field.length;i++) {
			field[i].checked=false;}
			checkflag="false";
			return "选择全部";}
}
</script>
<style type="text/css">
<!--
.STYLE1 {color: #FF0000}
-->
</style>
<table width="98%" border="0" cellspacing="0" cellpadding="0" align=center class="tableBorder"> 
  <tr> 
     <th height=25 colspan="2" class="tableHeaderText">新闻分类</th> 
  </tr> 
  <tr> 
     <td colspan="2" class="forumRowHighlight"><p><B>注意</B>：<BR> 
         ①类别直接与发布的信息相关联，删除类别可能会影响到以前发布的新闻信息。<BR> </td> 
  </tr> 
  
  <tr>
    <td width="26%" height=25 class="forumRowHighlight">&nbsp;</td>
	 <td class="forumRowHighlight"><a href="News_index.asp">管理新闻</a> | <a href="News_add.asp">添加新闻</a> | <a href="Class.asp">管理类别</a> | <a href="Class_add.asp">添加类别</a> | [<a href="javascript:location.reload()">刷新页面</a>] </td> 
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
      <td width="25%" align="left" class=bodytitle wnewsidth="446">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<font color="ff6600"><b>分类名称</b></font></td>
      <td width="21%" align="center" class=bodytitle wnewsidth="446"><font color="ff6600"><b>所属分类</b></font></td>
      <td width="6%" align="center" class=bodytitle wnewsidth="446"><font color="ff6600"><b>排序</b></font></td>
      <td width="48%" align="center" class=bodytitle wnewsidth="62"><font color="ff6600"><b>操作</b></font></td>
    </tr>
   
<%
j=1
do while not rs.eof and rowcount > 0
%> 
	 <tr height="20">
      <td align="left" class=forumRow> 
	  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<a href="Class.asp?id=<%=Rs("id")%>"><%=Rs("CatName")%></a>[<span class="STYLE1"><%=GetCount(Rs("id"))%></span>] [ID=<%=Rs("id")%>]</td>
      <td align="left" class=forumRow>&nbsp;
	  <%if rs("root")=0 then 
	  		response.write("作为顶级分类")
		else
			response.write GetCatName(request.querystring("id"))
		end if
	  %></td>
      <td align="left" class=forumRow>&nbsp;<%=Rs("ORderID")%></td>
      <td height="30" align="center" class=forumRow><a href="Class_edit.asp?id=<%=Rs("id")%>">修改</a> | <a href="Class_Save.asp?action=del&id=<%=Rs("id")%>">删除</a>
      </td>
    </tr>
    <%
	rowcount=rowcount-1
	rs.movenext
	j=j+1
loop

%> 
<tr height="20" bgcolor="#ffffff">
      <td height="30" colspan="4" align="center" class=forumRow> <%=listPages("Class.asp?id="&request.querystring("id"))%></td>
    </tr>
    <tr height="20" bgcolor="#ffffff">
      <td class=forumrowHighLight align="center" colspan="4">&nbsp;</td>
    </tr>
  </table>
</form>
<%
Rs.close
Set Rs=nothing
'分类名称
Function GetCatName(id)
	Sql="Select CatName from benming_ch_NewsCat where id="&id
	Set Rs1=Server.Createobject("ADODB.RecordSet")
	Rs1.open Sql,Conn,1,1
	if Rs1.bof=false and Rs1.eof=false then
		GetCatName=Rs1("CatName")
	end if
	Rs1.close
	Set Rs1=nothing
end function

Function GetCount(id)
	Sql="Select Count(*) from benming_ch_NewsCat where root="&id
	Set Rs1=Server.Createobject("ADODB.RecordSet")
	Rs1.open Sql,Conn,1,1
	if Rs1.bof=False and Rs1.eof=False then
		GetCount=Rs1(0)
	else
		GetCount=0
	end if
End Function
Conn.close
Set Conn=nothing
%>