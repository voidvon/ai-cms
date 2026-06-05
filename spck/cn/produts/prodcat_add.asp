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
	if(document.FORM1.CatName.value.length<1)
 	{
   		alert("您必须输入类别名称!");
   		document.FORM1.CatName.focus();
   		return false;
 	}
	if(document.FORM1.ORderID.value=="")
	{
		alert("排序不能为空!");
   		document.FORM1.ORderID.focus();
   		return false;
	}
	
}
</SCRIPT> 
 <table width="98%" border="0" cellspacing="0" cellpadding="0" align=center class="tableBorder"> 
  <tr> 
     <th height=25 colspan="2" class="tableHeaderText">产品分类</th> 
  </tr> 
  <tr> 
     <td colspan="2" class="forumRowHighlight"><p><B>注意</B>：<BR> 
         ①类别直接与发布的信息相关联，删除类别可能会影响到以前发布的产品信息。<BR> </td> 
  </tr> 
  
  <tr>
    <td width="19%" height=25 class="forumRowHighlight">&nbsp;</td>
	 <td width="81%" class="forumRowHighlight"><a href="prod.asp">管理产品</a> | <a href="prod_add.asp">添加产品</a> | <a href="prodcat.asp">管理类别</a> | <a href="prodcat_add.asp">添加类别</a> | <a href="prodphoto.asp">图片管理</a> | <a href="prodphoto_add.asp">添加图片</a> | [<a href="javascript:location.reload()">刷新页面</a>] </td> 
  </tr> 
</table> 

<FORM name="FORM1" id="FORM1" onSubmit="return FORM1_onsubmit()" action="prodcat_save.asp?action=add" method="post"> 
  <TABLE width=100% border="0" align="center" cellPadding=3 cellSpacing=1 class="tableBorder"> 
    <TR> 
      <Th colSpan=2 height="28" class="tableHeaderText">添加产品分类</Th> 
    </TR> 
    <TR>
      <TD height=25 class="forumRowHighlight" align=right><b>所属分类：</b></TD>
      <TD height=25 class="forumRowHighlight">
	  <select name="Root" id="Root">
        <option value="0">作为顶级分类</option>
		<%
		Sql="Select * from benming_ch_ProdCat where Root=0 order by orderid"
		Set Rs=Server.CreateObject("ADODB.RecordSet")
		Rs.open Sql,Conn,1,1
		do while not Rs.eof
			Response.Write("<option value="&Rs("id")&">"&Rs("CatName")&"</option>")
			Rs.movenext
		loop
		Rs.close
		Set Rs=nothing
		Conn.close
		Set Conn=nothing
		%>
      </select>      </TD>
    </TR>
    <TR> 
      <TD width=31% height=25 class="forumRowHighlight" align=right><b>要添加的类别名称：</b></TD> 
      <TD width=69% height=25 class="forumRowHighlight"><INPUT name=CatName id="CatName" size=25 maxLength=40> <font color='#FF0000'>*</font></TD> 
    </TR> 
    <TR>
      <TD height="27"  class="forumRowHighlight" align="right"><b>排序：</b></TD>
      <TD height="27"  class="forumRowHighlight"><INPUT name=ORderID id="ORderID" name-"OrderID" value="1" size=10 maxLength=16> <font color='#FF0000'>*</font></TD>
    </TR>
    <TR>
      <TD height="27"  class="forumRowHighlight" align="right"><b>分类关键字：</b></TD>
      <TD height="27"  class="forumRowHighlight"><input name="key" type="text" id="key" size="80"></TD>
    </TR>
    <TR>
      <TD height="27"  class="forumRowHighlight" align="right"><b>分类描述：</b></TD>
      <TD height="27"  class="forumRowHighlight"><textarea name="desc" cols="80" rows="5" id="desc"></textarea></TD>
    </TR>
    <TR> 
      <TD colSpan=2 height="27" align=center class="forumRowHighlight"> <INPUT type=submit value='确 定 添 加' name=Submit2> </TD> 
    </TR> 
  </TABLE> 
  
</FORM> 
<br/>
