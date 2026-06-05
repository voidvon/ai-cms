<% data_path="../../../" 'ACC连接数据库路径，对SQL无效 %>
<!--#include file="../../../conn/conn.asp"-->
<!--#include file="../../../inc/safe.asp"-->
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=gb2312">
<LINK href="../../css/style.css" rel=stylesheet type=text/css>
<style type="text/css">
<!--
.STYLE1 {color: #FF0000}
-->
</style>
</head>
<script type="text/javascript"  src="../../ueditor/ueditor.config.js"></script>
<script type="text/javascript"  src="../../ueditor/ueditor.all.min.js"> </script>
<script type="text/javascript"  src="../../ueditor/lang/zh-cn/zh-cn.js"></script>
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
 '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^End
id=Request.querystring("id")
if Chkrequest(id) then
	Sql="Select * from benming_ch_Cocat where id="&id
	Set Rs=Server.Createobject("ADODB.RecordSet")
	Rs.open Sql,conn,1,1
	if Rs.eof and rs.bof then
		call HOPE_err("错误","你还没有添加分类!","返回","Co_Class.asp")
		Response.End
	else
		content=Rs("Centern")
	end if
	Rs.Close
	Set Rs=nothing
else
	call HOPE_err("错误","分类不存在","返回","Co_Class.asp")
	Response.End
end if
 %>

<SCRIPT language=javascript>
function FORM1_onsubmit()
{
	if(document.FORM1.select.value.length<1)
 	{
   		alert("您必须输入类别名称!");
   		document.FORM1.select.focus();
   		return false;
 	}
}

</SCRIPT> 
 <!--#include file="top.asp"-->  
<FORM name="FORM1" id="FORM1" onSubmit="return FORM1_onsubmit()" action="Co_Save.asp?action=save" method="post"> 
  <TABLE width=100% border="0" align="center" cellPadding=3 cellSpacing=1 class="tableBorder"> 
    <TR> 
      <Th colSpan=2 height="28" class="tableHeaderText">添加公司信息类别</Th> 
    </TR> 
    <TR>
      <TD height=25 class="forumRowHighlight" align=right><b>类别名称：</b></TD>
      <TD height=25 class="forumRowHighlight">
	  <select name="select">
<%
	  Sql="Select * From benming_ch_Cocat where id="&id
	  Set Rs=Server.CreateObject("ADODB.RecordSet")
	  Rs.open Sql,conn,1,1
	  do while not Rs.eof 
	  	if Cint(id)=Cint(rs("id")) then
			Response.Write("<option value='"&Rs("id")&"' selected>"&Rs("Coname")&"</option>")
		else
		  	Response.Write("<option value='"&Rs("id")&"'>"&Rs("Coname")&"</option>")
		end if
		Rs.movenext
	  loop
	  Rs.close
	  Set Rs=nothing
	  Conn.close
	  Set Conn=nothing
%>
	</select>
      (<span class="STYLE1">注：类别名称不能随便修改</span>)      
    </TD>
    </TR>
    <TR> 
      <TD width=16% height=25 class="forumRowHighlight" align=right><b>内容：</b></TD> 
      <TD width=84% height=25 class="forumRowHighlight">
	
	   <textarea name="content" id="myEditor" style="width:780px; height:300px"><%=content%></textarea>
<script type="text/javascript">
    UE.getEditor('myEditor')
</script>
	  </TD> 
    </TR> 
    
    <TR> 
      <TD colSpan=2 height="27" align=center class="forumRowHighlight"> <INPUT type=submit value='确 定 保 存' name=Submit2> </TD> 
    </TR> 
  </TABLE> 
  
</FORM> 

 <br/>