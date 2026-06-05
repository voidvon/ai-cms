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
 	if trim(ins)="03" then 
 		ishavegant=true
 	end if
 next 
 if ishavegant=false then
	 response.redirect "../../err.asp"
 	response.end
 end if
id=request.querystring("id")
if Chkrequest(id)=false then
	response.end
end if
Sql="Select * from benming_ch_Contact where id="&id
Set Rs=Server.Createobject("ADODB.RecordSet")
Rs.open Sql,Conn,1,1
if Rs.eof=False and Rs.bof=False then
	offname=Rs("offname")
	address=Rs("address")
	phone=Rs("phone")
	fax=Rs("fax")
	linkren=Rs("linkren")
	Email=Rs("Email")
	Post=Rs("Post")
end if
Rs.close
Set Rs=nothing
 %>
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=gb2312">
<LINK href="../../css/style.css" rel=stylesheet type=text/css></head>
<SCRIPT language=javascript>
function FORM1_onsubmit()
{
	if(document.FORM1.offname.value=="")
 	{
   		alert("您必须输入办事处名称!");
   		document.FORM1.offname.focus();
   		return false;
 	}
	
}

</SCRIPT>
<table width="98%" border="0" cellspacing="0" cellpadding="0" align=center class="tableBorder"> 
  <tr> 
     <th height=25 colspan="2" class="tableHeaderText">公司信息分类</th> 
  </tr> 
  <tr> 
     <td colspan="2" class="forumRowHighlight"><p><B>注意</B>：<BR> 
         ①类别直接与发布的信息相关联，删除类别可能会影响到以前发布的公司信息。<BR> </td> 
  </tr> 
  
  <tr>
    <td width="26%" height=25 class="forumRowHighlight">&nbsp;</td>
	 <td class="forumRowHighlight"><a href="Offices.asp">管理办事处联系方式</a> | <a href="Offices_add.asp">添加办事处联系方式</a> | [<a href="javascript:location.reload()">刷新页面</a>] </td> 
  </tr> 
</table>

<FORM name="FORM1" id="FORM1" onSubmit="return FORM1_onsubmit()" action="Offices_save.asp?action=save" method="post"> 
  <TABLE width=100% border="0" align="center" cellPadding=3 cellSpacing=1 class="tableBorder"> 
    <TR> 
      <Th colSpan=4 height="28" class="tableHeaderText">修改办事处联系信息</Th> 
    </TR> 
    <TR>
      <TD height=25 class="forumRowHighlight" align=right><b>办事处名称：</b></TD>
      <TD height=25 colspan="3" class="forumRowHighlight">
	  <input name="offname" type="text" id="offname" value="<%=offname%>" size="30"> 
      <font color='#FF0000'>*
      <input type="hidden" name="hidid" value="<%=id%>">
      </font></TD>
    </TR>
    <TR> 
      <TD width=17% height=25 class="forumRowHighlight" align=right><b>地址：</b></TD> 
      <TD height=25 colspan="3" class="forumRowHighlight"><input name="address" type="text" id="address" size="50" value="<%=address%>"></TD>
    </TR> 
    <TR>
      <TD height="27"  class="forumRowHighlight" align="right"><b>电话：</b></TD>
      <TD width="35%" height="27"  class="forumRowHighlight"><input name="phone" type="text" id="phone" size="30" maxlength="100" value="<%=phone%>"></TD>
      <TD width="7%" height="27"  class="forumRowHighlight"><strong>传真</strong>：</TD>
      <TD width="41%" height="27"  class="forumRowHighlight"><input name="fax" type="text" id="fax" size="30" maxlength="100" value="<%=fax%>"></TD>
    </TR>
    <TR>
      <TD height="27" align=right class="forumRowHighlight"><B>联系人</B>：</TD>
      <TD height="27" align=left class="forumRowHighlight"><input name="linkren" type="text" id="linkren" size="30" maxlength="100" value="<%=linkren%>"></TD>
      <TD height="27" align=left class="forumRowHighlight"><B>Email：</B></TD>
      <TD height="27" align=left class="forumRowHighlight"><input name="email" type="text" id="email" size="30" maxlength="100" value="<%=email%>"></TD>
    </TR>
    <TR >
      <TD height="27" align=right class="forumRowHighlight"><B>邮编</B>：</TD>
      <TD height="27" align=left class="forumRowHighlight"><input name="post" type="text" id="post" size="30" maxlength="100" value="<%=post%>"></TD>
      <TD height="27" align=left class="forumRowHighlight">&nbsp;</TD>
      <TD height="27" align=left class="forumRowHighlight">&nbsp;</TD>
    </TR>
    <TR> 
      <TD colSpan=4 height="27" align=center class="forumRowHighlight"> <INPUT type=submit value='确 定 修 改' name=Submit2> </TD> 
    </TR> 
  </TABLE> 
  
</FORM> 

 <br/>