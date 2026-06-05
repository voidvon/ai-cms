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
id=request.QueryString("id")
action=request.QueryString("action")
Sql="Select * from benming_ch_cuskind where id="&id
Set Rs=Server.CreateObject("ADODB.RecordSet")
Rs.open Sql,Conn,1,3
if action="save" then
  	addkind=Trim(Request.Form("addkind"))
 		Rs("kindname")=addkind
	Rs.update
	Rs.close
	Set Rs=nothing
	Conn.close
	Set conn=nothing
	response.Redirect("cuskind.asp")
else
	if not rs.eof then
		addkind=rs("kindname")
	end if
	Rs.close
	Set RS=nothing
	Conn.close
	Set Conn=nothing
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

  	function isempty(){
		var str=document.addform.addkind.value;
  		if(str.replace(/\s+/g,"")==""){
  			alert("请输入类别名称！");
  			document.addform.addkind.focus();
  			return false;
  		} 
}
</script>
<style type="text/css">
a:link{
	color: #E30000;
}
a:visited{
	color: #E80000;
}
a:hover{}
a:active{}
</style>
<LINK href="../../css/style.css" rel=stylesheet type=text/css>
<table border="0" cellspacing="1" cellpadding="3" align=center class="tableBorder"> 
  <tr> 
    <th width="180%" class="tableHeaderText" height=25>网站HTML自定义标签管理</th> 
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
<table width="98%" border="0" align="center" cellpadding="0" cellspacing="0" class="tableBorder"  >
	 
 <tr>
 	<td>  
  <form   name="addform" method="post" action="cuskind_ed.asp?action=save&id=<%=id%>" onSubmit="return isempty();">
 	<table width="100%" align="center" >
 		<tr>
			<td align="center">
 			<font color="#799ADD">添加自定义标签类别</font> </td>
 		</tr>
 		<tr>
			<td colspan="2" align="center" bgcolor="#F4F3F0">类别名称: 
   <input type="text" name="addkind" value="<%=addkind%>" onBlur="this.value=this.value.replace(/\s/g,'')"  maxlength="25"/>
   &nbsp;&nbsp;
   <input type="submit"  value="修改类别"  name="addbtn"  style="background-color:#F4F3F0"/></td>
 		</tr>
  	</table>
  </form> 
  
    </td>
 </TR></table>
 
 
</body>
</html>
