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

<LINK href="../../css/style.css" rel=stylesheet type=text/css>
<SCRIPT language=javascript>
<!--
function admin_Size(num,objname)
{
	var obj=document.getElementById(objname)
	if (parseInt(obj.rows)+num>=3) {
		obj.rows = parseInt(obj.rows) + num;	
	}
	if (num>0)
	{
		obj.width="90%";
	}
}
//模板ID链接
function HOPE_TemplateLink(targ,selObj,restore){
		
  eval(targ+".location='"+selObj.options[selObj.selectedIndex].value+"'");
  if (restore) selObj.selectedIndex=0;
}


function DelConfrim(){
	if (confirm("你是否真的要删除此模板?")){
		return true;

	}
	else{
		return false;
	
	}
	}
//--> 
</SCRIPT>
<table border="0" cellspacing="1" cellpadding="3" align=center class="tableBorder"> 
  <tr> 
    <th width="180%" class="tableHeaderText" height=25>网站HTML模板管理</th> 
  </tr> 
  <tr> 
    <td class="forumRowHighlight"><p><B>注意</B>：<BR> 
        ①在这里，您可以修改模板，可以编辑风格，操作时请按照相关页面提示完整填写表单信息。<br>
        ②执行删除时要慎重，任何的删除操作都是不可逆的。<BR>
        <br> </td> 
  </tr> 
</table>
 
<form name="Form" action="?action=saveedit" method=post>
  <table width="100" border="0" align=center cellpadding="5" cellspacing="1" class="tableBorder">
    <tr>
      <th class="tableHeaderText" colspan=4 height=25>网站各大版块模板管理</th>
    </tr>
	
    <tr>
      <td width=25% height="25" align=center class="forumRowHighlight">ID<br></td>
      <td height="25" align=center class="forumRowHighlight">名称</td>
      <td width="21%" height="25" align="center" class="forumRowHighlight">选择</td>
      <td width="32%" height="25" align="center" class="forumRowHighlight">操作</td>
    </tr>
	<%
	Sql="Select * from benming_ch_worldec_Temp  "
	Set Rs=Server.CreateObject("adodb.recordset")
	Rs.open Sql,conn,1,1
	do while not Rs.eof
	%>
    <tr>
      <td class="forumRowHighlight" width=25% align=center><%=Rs("id")%></td>
      <td class="forumRowHighlight" width=22% align=center><%=Rs("tempname")%></td>
      <td align="center" class="forumRowHighlight"><label>
        <input type="radio" name="sele" value="1" <%if rs("selected")=1 then response.Write("checked")%> >
      </label></td>
      <td align="left" class="forumRowHighlight"><select name="select" onChange="HOPE_TemplateLink('self',this,0)">
	  <option>请选择需要修改的模板</option>
	  	
		
        </select>&nbsp;&nbsp;&nbsp;&nbsp;<a href="worldec_index.asp?id=<%=rs("id")%>">修改全部</a></td>
    </tr>
	<%
	rs.movenext
	loop
	Rs.close
	Set Rs=nothing
	%>
    <tr>
      <td height=25 colspan="4" align=right class="forumRowHighlight"><label>
        <input type="button" name="Submit" value="增加模版" onClick="javascript:location.href='yx_temp_add.asp'">
        <input type="submit" name="aaa" value="设为默认模版">
      </label>
        <label>
        <input type="submit" name="aaa" value="删除" onClick="return DelConfrim()">
      </label>
      <label></label></td>
    </tr>
  </table>
</form> 
 
</body>
</html>

