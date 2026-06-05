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
 	if trim(ins)="06" then 
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
</head>
<SCRIPT language=javascript>
function FORM1_onsubmit()
{
	if(document.form.photoName.value.length<1)
 	{
   		alert("图片名字不能为空!");
   		document.form.photoName.focus();
   		return false;
 	}
	if(document.form.picture.value=="")
	{
		alert("图片路径不能为空!");
   		document.form.picture.focus();
   		return false;
	}
	
}
</SCRIPT> 
 <table width="98%" border="0" cellspacing="0" cellpadding="0" align=center class="tableBorder"> 
  <tr> 
     <th height=25 colspan="2" class="tableHeaderText">图片上传</th> 
  </tr> 
  <tr> 
     <td colspan="2" class="forumRowHighlight"><p><B>注意</B>：<BR> 
         ①图片直接与发布的产品相关联，删除图片可能会影响到以前发布的产品信息。<BR> </td> 
  </tr> 
  
  <tr>
    <td width="19%" height=25 class="forumRowHighlight">&nbsp;</td>
	 <td width="81%" class="forumRowHighlight"><a href="prod.asp">管理产品</a> | <a href="prod_add.asp">添加产品</a> | <a href="prodcat.asp">管理类别</a> | <a href="prodcat_add.asp">添加类别</a> | <a href="prodphoto.asp">图片管理</a> | <a href="prodphoto_add.asp">添加图片</a> | [<a href="javascript:location.reload()">刷新页面</a>] </td> 
  </tr> 
</table> 

<FORM name="form" id="form" onSubmit="return FORM1_onsubmit()" action="prodphoto_save.asp?action=add" method="post"> 
  <TABLE width=100% border="0" align="center" cellPadding=3 cellSpacing=1 class="tableBorder"> 
    <TR> 
      <Th colSpan=2 height="28" class="tableHeaderText">添加产品分类</Th> 
    </TR> 
    <TR>
      <TD height=25 class="forumRowHighlight" align=right><b>上传图片名称：</b></TD>
      <TD height=25 class="forumRowHighlight"><input name=photoName id="photoName" size=41 maxlength=100> <font color='#FF0000'>*</font></TD>
    </TR>
    <TR> 
      <TD width=31% height=25 class="forumRowHighlight" align=right><b>上传图片：</b></TD> 
      <TD width=69% height=25 class="forumRowHighlight">
	  <iframe id="d_file" frameborder="0" src="../../../inc/upload.asp?tMode=3&istwo=0&utype=prod" width="250" height="22" scrolling="no"></iframe>
	  </TD> 
    </TR> 
    <TR>
      <TD height="27"  class="forumRowHighlight" align="right"><b>上传的图片的路径：</b></TD>
      <TD height="27"  class="forumRowHighlight"><input name=picture id="picture" name-"picture" size=42></TD>
    </TR>
    
    <TR> 
      <TD colSpan=2 height="27" align=center class="forumRowHighlight"> <INPUT type=submit value='确 定 添 加' name=Submit2> </TD> 
    </TR> 
  </TABLE> 
  
</FORM> 
<br/>
