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
 	if trim(ins)="02" then 
 		ishavegant=true
 	end if
 next 
 if ishavegant=false then
	 response.redirect "../../err.asp"
 	response.end
 end if
%>
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=gb2312">
<LINK href="../../css/style.css" rel=stylesheet type=text/css> 
</HEAD>
<body>
<table width="98%" border="0" cellspacing="0" cellpadding="0"  align=center class="tableBorder"> 
  <tr> 
     <th width="100%" height=25 class="tableHeaderText"> 网站Meta信息管理 </th> 
  </tr> 
  <tr> 
     <td class="forumRowHighlight"><p><B>注意</B>：<BR> 
         ①网站Meta信息的关键字和描述信息是用于搜索引擎搜索页面用途; <font color="red">请用"|"将各词之间隔开</font> </td> 
  </tr>
  <tr>
    <td align="center" class="forumRowHighlight"><a href="Meta_keywords.asp">关键字管理</a> | <a href="Meta_keywords_add.asp">添加页面关键字</a> | </td>
  </tr> 
</table>
 
<table width="95%" border="0" cellspacing="1" cellpadding="3"  align=center class="tableBorder">
	<tr> 
	<th height="22">网站Meta信息列表</th>
	</tr>
</table>
<table width="95%" border="0"  align=center cellpadding="0" cellspacing="0" bordercolor="#F1F3F5" bgcolor="#F6F6F6" class="tableBorder">
<tr bgcolor="#F0F0F0">
	<td width="17%" height="25" align="center" bgcolor="#F1F3F5">&nbsp;</td>
	<td colspan="2" align="center" nowrap bgcolor="#F1F3F5">
		<div align="left"><br>
  			(对应标签HOPE_Meta_Keywords(typeid)#)
  			(对应标签#HOPE_Meta_Description(typeid)#)
		</div>
	</td>
	<td width="14%" align="center">操作</td>
</tr>
<%
Sql="Select * from benming_ch_MetaType "
Set Rs=Server.CreateObject("ADODB.RecordSet")
Rs.open Sql,Conn,1,1
i=0
do while not Rs.eof
%>
<tr>
	<td align="right" bgcolor="#FFFFFF"><%=Rs("typename")%>：</td>
	<td height="22" colspan="2" align="left" bgcolor="#FFFFFF" class="red">[调用标签]：#HOPE_Meta_Keywords(<%=Rs("id")%>)#&nbsp;&nbsp;&nbsp;&nbsp; #HOPE_Meta_Description(<%=Rs("id")%>)#</td>
	<td rowspan="4" align="left">&nbsp;<a href="Mate_edit.asp?id=<%=Rs("id")%>">修改Meta信息</a></td>
</tr>
<tr bgcolor="#F1F3F5">
	<td align="right" bgcolor="#FFFFFF">&nbsp;</td>
	<td width="12%" height="22" align="left" bgcolor="#FFFFFF"><div align="right">Meta关键字：</div></td>
	<td width="57%" height="22" align="left" bgcolor="#FFFFFF">
		<input name="metakeys1" type="text" value="<%=Rs("meta_keywords")%>" size="70">
	</td>
</tr>
<tr bgcolor="#F1F3F5">
	<td align="right" bgcolor="#FFFFFF">&nbsp;</td>
	<td height="22" align="left" bgcolor="#FFFFFF"><div align="right">Meta描述信息：</div></td>
	<td height="22" align="left" bgcolor="#FFFFFF"><input name="metades1" type="text" value="<%=Rs("meta_descriptions")%>" size="70"></td>
</tr>
<tr bgcolor="#F1F3F5">
	<td align="right" bgcolor="#FFFFFF">&nbsp;</td> 
	<td height="22" align="center" bgcolor="#FFFFFF"><div align="right">标题：</div></td>
	<td height="22" align="center" bgcolor="#FFFFFF">
		<div align="left"><input name="title1" type="text" id="title1" value="<%=Rs("title")%>" size="70"></div>
	</td>
</tr>
<tr bgcolor="#FFFFFF">
	<td height="8" colspan="4" align="right" bgcolor="#4455AA"> </td>
</tr>
<%
		Rs.movenext
loop
Rs.close
Set Rs=nothing

Conn.close
Set Conn=nothing
%>
</table>
 <br>
</body>
</html>