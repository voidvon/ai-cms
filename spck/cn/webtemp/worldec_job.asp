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
Set Rs=Server.CreateObject("adodb.recordset")
if request.QueryString("action")="saveedit" then
	sql="select * from benming_ch_worldec_Temp where id="&id
	Rs.open sql,conn,3,3
		Rs("job_index")=request.Form("job_index")
	Rs.update
	Rs.close
	Set Rs=nothing
	Response.Redirect("worldec_job.asp?id="&id)
else
	
	Sql="Select tempname,job_index from benming_ch_worldec_Temp  where id="&id
	Rs.open sql,conn,1,3
	if not RS.eof then
		tempname=rs("tempname")
		job_index=rs("job_index")
		
		
	end if
	rs.close
	set rs=nothing
	conn.close
	set conn=nothing
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
-->
</style></head>
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
//--> 
</SCRIPT>
<body>

<!--#include file="top.asp"-->
 
<form name="Form" action="?action=saveedit&id=<%=id%>" method=post> 
  <table border="0" cellspacing="1" cellpadding="3" align=center class="tableBorder"> 
    <tr> 
      <th class="tableHeaderText" colspan=2 height=25><font color="#FFFFFF">人才招聘模版风格管理理</font></th> 
    </tr> 
    <tr>
      <td class="forumRowHighlight" height=30 align=left>模版名称：</td>
      <td class="forumRowHighlight" height=30 align=left><label>
        <input name="tempname"  onblur="this.value=this.value.replace(/\s/igm,'')" type="text" id="tempname" value="<%=tempname%>" size="50" maxlength="50">
      </label></td>
    </tr>
     
    <tr> 
      <td class="forumRowHighlight" width=16% height=40 align=left>人才招聘模版：<br/><a href="Job/worldec_detail.asp?id=<%=id%>"><U>进入人才模板</u></a>      </td> 
      <td class="forumRowHighlight" width=84% height=40 align=left>
	    <input name="job_index" type="text" id="job_index" value="<%=job_index%>" size="60" maxlength="100">( <a href="<%=job_index%>" target="_blank">查看模版</a> )</td> 
    </tr> 
	 
    <tr> 
      <td height="25" colspan="2" align="center" class="forumRowHighlight"><input type="submit" name="B1" value="确定修改设置"></td> 
    </tr> 
  </table> 
</form> 

 
</body>
</html>
