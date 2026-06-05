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
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=gb2312">
<link rel="stylesheet" type="text/css" href="../../css/style.css">
<style type="text/css">
<!--
.STYLE2 {color: #FF0000}
-->
</style>
</head>
<script LANGUAGE="JavaScript">
function check()
{
	if (document.form.jobName.value=="")
	{
		alert("招聘职位不能为空！")
		document.form.jobName.focus();
		return
	}
	if (document.form.address.value=="")
	{
		alert("工作地区不能为空！")
		document.form.address.focus();
		return
	}
	if (document.form.jobnob.value=="")
	{
		alert("招聘人数不能为空！")
		document.form.jobnob.focus();
		return
	}
	if (document.form.linkren.value=="")
	{
		alert("联系人不能为空！")
		document.form.linkren.focus();
		return
	}
	if (document.form.phone.value=="")
	{
		alert("联系电话不能为空！")
		document.form.phone.focus();
		return
	}
	if (document.form.address.value=="")
	{
		alert("工作地区不能为空！")
		document.form.address.focus();
		return
	}
	document.form.submit()
}
</script>
<form name="form" method="POST" action="job_save.asp?action=add"> 

  <TABLE width="100%" border="0" align=center cellpadding="0" cellspacing="1" class="tableBorder"> 
    <tr> 
      <th height=25 colspan="2" class="tableHeaderText">发布职位</th> 
    </tr> 
    <TR ALIGN="center"> 
      <TD> <TABLE width="100%" border="0" cellpadding="5" cellspacing="2" bordercolorlight="#CEE7FF" bordercolordark="#CEE7FF" style="border-collapse: collapse"> 
          <TR> 
            <TD width="133" align="right" nowrap class="Forumrow"><b>招聘职位</b>：</b></TD> 
            <TD colspan="3" class="Forumrow"><font color="#F4FAFF">
              <input name="jobName" type="text" id="jobName">
            </a></font>  <span class="STYLE2">*</span></TD>
          </TR>
		  
		   <TR> 
            <TD align="right" valign="middle" class="Forumrow"><b>工作地区</b>：</td> 
            <TD colspan="3" class="Forumrow"><font color="#F4FAFF">
			  <input name="address" type="text" class="smallInput" id="address" size="55" maxlength="50">
              <a href="prodcat_add.asp"><span class="STYLE2">*</span></a></font></TD> 
          </TR>
		      	  		  		  		 
		       <TR>
		         <td class="Forumrow" align="right"><b>招聘人数： </b></td>
		         <TD colspan="3" class="Forumrow"><input name="jobnob" type="text" id="jobnob" value="1" size="5">
	             <a href="prodcat_add.asp"><span class="STYLE2">*</span></a></TD>
          </TR>
	       

		  <TR>
		    <TD align="right" class="Forumrow"><b>联系人：</B></td>
		    <TD width="209" valign="middle" class="Forumrow"><input name="linkren" type="text" id="linkren" size="30">
	        <a href="prodcat_add.asp"><span class="STYLE2">*</span></a></TD>
	        <TD width="92" valign="middle" class="Forumrow"><B>联系电话：</B></TD>
	        <TD width="452" valign="middle" class="Forumrow"><input name="phone" type="text" id="phone">
            <a href="prodcat_add.asp"><span class="STYLE2">*</span></a></TD>
          </TR>
		   
          <TR>
            <TD align="right" class="Forumrow"><b>发布状态：</b></TD>
            <TD colspan="3" class="Forumrow"><input name="state" type="checkbox" id="state" value="1" checked>
              (<span class="STYLE2">选中为发布状态</span>)</TD>
          </TR>
          <TR> 
            <TD align="right" class="Forumrow"><b>任职要求：</b></TD> 
            <TD colspan="3" class="Forumrow"><textarea name="content" style="display:none"></textarea><iframe ID="eWebEditor1" src="/editor/ewebeditor.asp?id=content&style=standard&originalfilename=d_originalfilename &savefilename=d_savefilename &savepathfilename=d_savepathfilename" frameborder="0" scrolling="no" width="617" HEIGHT="450"></iframe></TD> 
          </TR> 
          <TR height="40"> 
            <TD colspan="4" align="center" class="Forumrow" height="40">
              <input type="button" name="Submit" value=" 提　交 保 存" class="smallInput" onClick="check()">
			  &nbsp;&nbsp;&nbsp; 
            <input type="reset" name="Submit2" value=" 重　新 添 写" class="smallInput">          </TR> 
      </TABLE></TD> 
    </TR> 
  </TABLE> 
  <Br/>
</FORM> 

