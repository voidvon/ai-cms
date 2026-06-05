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
 
 act=request.QueryString("action")
 if act="del" then
 	id=request.QueryString("id")
 	Sql="delete from benming_ch_cuslabel where id="&id
	Conn.Execute(sql)
 end if
 %>
<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN"
"http://www.w3.org/TR/html4/loose.dtd">
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=gb2312">
<LINK href="../../css/style.css" rel=stylesheet type=text/css>
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
.STYLE2 {color: #FF0000}
-->
</style></head>
 <script language="javascript">
   function isdel(){
 		var i=confirm("你确定要删除吗?删除此类别时，将删除所有属于该类别的所有自定义标签！");
 		if(i){
 			return true ;
		 }
		 else{
 			return false;
 		}
 }

  	

</script>
<body>


<table border="0" cellspacing="1" cellpadding="3" align=center class="tableBorder"> 
  <tr> 
    <th width="100%" class="tableHeaderText" height=25>网站HTML自定义标签管理</th> 
  </tr> 
  <tr> 
    <td class="forumRowHighlight"><p><B>注意</B>：<BR> 
        ①在这里，您可以修改模板，可以编辑风格，操作时请按照相关页面提示完整填写表单信息。<BR> 
        ②执行删除时要慎重，任何的删除操作都是不可逆的。<br> </td> 
  </tr> 
  <tr>
 	<td align="center" class="forumRowHighlight"><A href="addcuslabel.asp">添加自定义页面显示标签</A>| <a href="cuslabel.asp">自定义标签管理</a> | <a href="cuskind.asp">自定义标签类别管理</a> | [<a href="javascript:location.reload()">刷新页面</a>] </td> 
  </tr> 
</table>
<Br/>

  <table width="100%" border="0" align="center" cellpadding="3" cellspacing="1"  bgcolor="#F7F7F7" class="tableBorder">
  	<tr bgcolor=#ffffff>
  	  <th colspan="4" >自定义标签管理</th>
  	</tr>
	<%
	Sql="Select id, lname,ldes,lkind,lidate from benming_ch_cuslabel order  by lkind"
	Set Rs=Server.CreateObject("ADODB.RecordSet")
	Rs.open Sql,Conn,1,1
	i=0
	do while not Rs.eof
		i=i+1
		if i mod 2<>0 then
	%>
  	<tr bgcolor=#ffffff>
  		<td><font  color="#6E92DB"><%=i%>.</font><%=Rs("lname")%></td>
		<td>〖<font  color="#999999">类别:</font>
 			<a href="#"><font color="#0099CC"><%=Rs("lkind")%></font></a>〗<br />
			〖<font  color="#999999">描述:</font><font color="#666666"><%=Rs("ldes")%></font>〗</td>
		<td>〖<a href="cuslabel_ed.asp?id=<%=Rs("id")%>">修改</a>〗</td>
		<td>〖<a href="cuslabel.asp?action=del&id=<%=Rs("id")%>" onClick="return isdel();">删除</a>〗</td>
	</tr>
   <%else%>
  	<tr bgcolor=#F1F3F5>
		<td><font  color="#6E92DB"><%=i%>.</font><%=Rs("lname")%></td>
		<td>〖<font  color="#999999">类别:</font>
		<a href="cuskind.asp?act=showof&id=2&kn=标准金色风格"><font color="#0099CC"><%=Rs("lkind")%></font></a>〗<br />
		〖<font  color="#999999">描述:</font><font color="#666666"><%=Rs("ldes")%></font>〗</td>
		<td>〖<a href="cuslabel_ed.asp?id=<%=Rs("id")%>"  >修改</a>〗</td>
		<td>〖<a href="cuslabel.asp?action=del&id=<%=Rs("id")%>" onClick="return isdel();">删除</a>〗</td>
	</tr>
	<%
	end if
		Rs.movenext
	loop
	Rs.close
	Set Rs=nothing
	
	%>
  </table>


</body>
</html>

<%
Function GetcuskindName(id)
End Function 
Conn.close
	Set Conn=nothing
%>