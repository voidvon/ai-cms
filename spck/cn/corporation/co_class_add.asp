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

 %>
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=gb2312">
<LINK href="../../css/style.css" rel=stylesheet type=text/css>


</head>
<SCRIPT language=javascript>
function FORM1_onsubmit()
{
	if(document.FORM1.coname.value.length<1)
 	{
   		alert("您必须输入类别名称!");
   		document.FORM1.coname.focus();
   		return false;
 	}
	if(document.FORM1.OrderID.value=="")
	{
		alert("排序不能为空!");
   		document.FORM1.OrderID.focus();
   		return false;
	}
	
	if(document.FORM1.sitepath.checked==true){
		if(document.FORM1.siteurl.value==""){
			alert("跳转网址不能为空!");
			document.FORM1.siteurl.focus();
   			return false;
		}
	}
}

function ShowUrlTr(sid)
{
	if(document.FORM1.Root.value==0){
		alert("顶级分类不能连接外部地址!");
		document.FORM1.sitepath.checked=false;
	}
	else
	{
		whichEl = eval("Url");
		if (whichEl.style.display == "none")
		{
			eval("Url"  + ".style.display=\"\";");
		}
		else
		{
			eval("Url"  + ".style.display=\"none\";");
		}
	}
}
</SCRIPT>
  <!--#include file="top.asp"-->  

<FORM name="FORM1" id="FORM1" onSubmit="return FORM1_onsubmit()" action="Co_Class_Save.asp?action=add" method="post"> 
  <TABLE width=100% border="0" align="center" cellPadding=3 cellSpacing=1 class="tableBorder"> 
    <TR> 
      <Th colSpan=2 height="28" class="tableHeaderText">添加公司信息类别</Th> 
    </TR> 
    <TR>
      <TD height=25 class="forumRowHighlight" align=right><b>所属分类：</b></TD>
      <TD height=25 class="forumRowHighlight">
	  <select name="Root" id="Root">
        <option value="0">作为顶级分类</option>
        <%
		Sql="Select * from benming_ch_Cocat where Root=0 order by orderid"
		Set Rs=Server.CreateObject("ADODB.RecordSet")
		Rs.open Sql,Conn,1,1
		do while not Rs.eof
			Response.Write("<option value="&Rs("id")&">"&Rs("coname")&"</option>")
			Rs.movenext
		loop
		Rs.close
		Set Rs=nothing
		Conn.close
		Set Conn=nothing
		%>
      </select></TD>
    </TR>
    <TR> 
      <TD width=41% height=25 class="forumRowHighlight" align=right><b>要添加的类别名称：</b></TD> 
      <TD width=59% height=25 class="forumRowHighlight"><INPUT name=coname id="coname" size=25 maxLength=40> <font color='#FF0000'>*</font></TD> 
    </TR> 
    <TR>
      <TD height="27"  class="forumRowHighlight" align="right"><b>排序：</b></TD>
      <TD height="27"  class="forumRowHighlight"><INPUT name=OrderID id="OrderID" name-"OrderID" value="1" size=10 maxLength=16> <font color='#FF0000'>*</font></TD>
    </TR>
    <TR>
      <TD height="27" align=right class="forumRowHighlight"><B>跳转网址</B>：</TD>
      <TD height="27" align=left class="forumRowHighlight">
	  	<input name="sitepath" type="checkbox" id="sitepath" value="1" onClick="ShowUrlTr()">
	</TD>
    </TR>
    <TR id="Url" style="display:none">
      <TD height="27" align=right class="forumRowHighlight"><B>跳转网址</B>：</TD>
      <TD height="27" align=left class="forumRowHighlight"><input name="siteurl" type="text" id="siteurl" size="40"></TD>
    </TR>
    <TR> 
      <TD colSpan=2 height="27" align=center class="forumRowHighlight"> <INPUT type=submit value='确 定 添 加' name=Submit2> </TD> 
    </TR> 
  </TABLE> 
  
</FORM> 

 <br/>