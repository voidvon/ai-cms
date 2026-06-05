<% data_path="../../../" 'ACC连接数据库路径，对SQL无效 %>
<!--#include file="../../../conn/conn.asp"-->
<!--#include file="../../../inc/safe.asp"-->
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=gb2312">
<LINK href="../../css/style.css" rel=stylesheet type=text/css>
</head>
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
id=Request.querystring("id")
if Chkrequest(id) then
	Sql="Select * from benming_ch_Cocat where id="&id
	
	Set Rs=Server.Createobject("ADODB.RecordSet")
	Rs.open Sql,conn,1,1
	if Rs.eof and rs.bof then
		call HOPE_err("错误","分类不存在","返回","Co_Class.asp")
		Response.End
	else
		coname=Rs("coname")
		OrderID=Rs("orderid")
		Root=Rs("Root")
		Sitepath=Rs("sitepath")
		SiteUrl=Rs("siteurl")
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
	if(document.FORM1.ClassName.value.length<1)
 	{
   		alert("您必须输入类别名称!");
   		document.FORM1.ClassName.focus();
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

function ShowUrlTr()
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

<FORM name="FORM1" id="FORM1" onSubmit="return FORM1_onsubmit()" action="Co_Class_Save.asp?action=edit" method="post"> 
  <TABLE width=100% border="0" align="center" cellPadding=3 cellSpacing=1 class="tableBorder"> 
    <TR> 
      <Th colSpan=2 height="28" class="tableHeaderText">修改公司信息类别</Th> 
    </TR> 
    <TR>
      <TD height=25 class="forumRowHighlight" align=right><b>所属分类：</b></TD>
      <TD height=25 class="forumRowHighlight"><select name="Root" id="Root">
        <option value="0">作为顶级分类</option>
        <%
		Sql="Select * from benming_ch_Cocat where Root=0 order by orderid"
		Set Rs=Server.CreateObject("ADODB.RecordSet")
		Rs.open Sql,Conn,1,1
		do while not Rs.eof
			if Root=Rs("id") then
				Response.Write("<option value="&Rs("id")&" selected>"&Rs("coname")&"</option>")
			else
				Response.Write("<option value="&Rs("id")&">"&Rs("coname")&"</option>")
			end if
			Rs.movenext
		loop
		Rs.close
		Set Rs=nothing
		Conn.close
		Set Conn=nothing
		%>
      </select>
      <input type="hidden" name="hidurl" value="<%=request.ServerVariables("HTTP_REFERER")%>"></TD>
    </TR>
    <TR> 
      <TD width=41% height=25 class="forumRowHighlight" align=right><b>要修改的类别名称：</b></TD> 
      <TD width=59% height=25 class="forumRowHighlight"><INPUT name=coname id="coname" value="<%=coname%>" size=25 maxLength=40>
      <input type="hidden" name="hidid" value="<%=id%>"> <font color='#FF0000'>*</font></TD> 
    </TR> 
    <TR>
      <TD height="27"  class="forumRowHighlight" align="right"><b>排序：</b></TD>
      <TD height="27"  class="forumRowHighlight"><INPUT name=OrderID id="OrderID" name-"OrderID" value="<%=OrderID%>" size=10 maxLength=16> <font color='#FF0000'>*</font></TD>
    </TR>
	 <TR>
      <TD height="27" align=right class="forumRowHighlight"><B>跳转网址</B>：</TD>
      <TD height="27" align=left class="forumRowHighlight">
	  	<input name="sitepath" type="checkbox" id="sitepath" value="1" onClick="ShowUrlTr()" <%if sitepath=1 then response.Write "checked"%>>
	</TD>
    </TR>
    <TR id="Url" <%if Cint(sitepath)=0 then response.write "style=""display:none"""%>>
      <TD height="27" align=right class="forumRowHighlight"><B>跳转网址</B>：</TD>
      <TD height="27" align=left class="forumRowHighlight"><input name="siteurl" type="text" id="siteurl" size="40" value="<%=SiteUrl%>"></TD>
    </TR>
    <TR> 
      <TD colSpan=2 height="27" align=center class="forumRowHighlight"> <INPUT type=submit value='确 定 修 改' name=Submit2> </TD> 	</TR> 
  </TABLE> 
</FORM> 
<br/>