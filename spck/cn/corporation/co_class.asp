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
 
if request.querystring("action")="del" then
	id=request.form("selAnnounce")
	Sql="delete from benming_ch_Cocat where id in ("&id&")"
	conn.execute(sql)
	response.Redirect(request.ServerVariables("HTTP_REFERER"))
end if

if request.querystring("id")="" then
	Sql="Select * from benming_ch_Cocat where root=0 order by orderid"
else
	Sql="Select * from benming_ch_Cocat where root="&request.querystring("id")&" order by orderid"
end if
 %>
<meta http-equiv="Content-Type" content="text/html; charset=gb2312">
<LINK href="../../css/style.css" rel=stylesheet type=text/css> 

<script>
var checkflag="false";
function check(field){
if(checkflag=="false"){
for(i=0;i<field.length;i++){
field[i].checked=true;}
checkflag="true";
return "解除全选"; }
else {
for(i=0;i<field.length;i++) {
field[i].checked=false;}
checkflag="false";
return "选择全部";}}

function FORM1_onsubmit()
{
	var elements = document.getElementsByName("selAnnounce");
	var trel=false;
	for (var i=0; i<elements.length; i++){
		if(elements[i].checked){
			trel=true;
		} 
	}
	
	if(trel==false){
		alert("请选择数据");
		return false;
	}
}
</script>
<style type="text/css">
<!--
.STYLE1 {color: #FF0000}
-->
</style>
 <!--#include file="top.asp"--> 
<Form name="search" method="POST" action="Co_Class.asp?action=del" onSubmit="return FORM1_onsubmit()">
  <table width="100%" border="0" align="center" cellpadding="2" cellspacing="1" class="tableBorder">
    <tr>
      <th class="tableHeaderText" height=25 colspan="6">公司信息分类列表</th>
    </tr>
    <tr>
      <td colspan="6"></td>
    </tr>
    <tr height=25 class=bodytitle>
      <td width="55%" align="left" class=bodytitle wnewsidth="446">&nbsp;</td>
      <td width="8%" align="center" class=bodytitle wnewsidth="446"><font color="ff6600"><b>排序</b></font></td>
      <td width="9%" align="center" class=bodytitle wnewsidth="62"><font color="ff6600"><b>修改</b></font></td>
      <td width="10%" align="center" class=bodytitle wnewsidth="62"><font color="ff6600"><b>设置内容</b></font></td>
      <td width="10%" align="center" class=bodytitle wnewsidth="57"><input name="submit2" type='submit' value='删除' /></td>
      <td width="8%" align="center" class=bodytitle wnewsidth="57">&nbsp;</td>
    </tr>
    <%
	Set Rs=Server.Createobject("ADODB.RecordSet")
	Rs.open Sql,conn,1,1
	do while not Rs.eof
	%>
    <tr height="20">
      <td height="30" align="left" class=forumRow>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<a href="co_class.asp?id=<%=Rs("id")%>"><%=Rs("coname")%></a>[<span class="STYLE1"><%=GetCount(Rs("id"))%></span>] [ID=<%=Rs("id")%>]</td>
      <td height="30" align="center" class=forumRow><%=Rs("orderid")%></td>
      <td align="center" class=forumRow><a href="Co_Class_edit.asp?id=<%=Rs("id")%>">修改</a></td>
      <td align="center" class=forumRow>
	  <%if Rs("root")>0 and Rs("sitepath")=0 then%>
	  <a href="co_edit.asp?id=<%=Rs("id")%>">设置</a>
	  <%end if%></td>
      <td align="center" class=forumRow wnewsidth="57"><input type='checkbox' name='selAnnounce' value="<%=rs("id")%>" /></td>
      <td align="center" class=forumRow wnewsidth="57">&nbsp;</td>
    </tr>
    <%
	
		Rs.movenext
	loop
	Rs.close
	set Rs=nothing
	conn.close
	Set conn=nothing
	%>
    <tr height="20" bgcolor="#ffffff">
      <td height="30" colspan="2" align="left" class=forumRow>&nbsp;</td>
      <td colspan="2" align="left" class=forumRow>&nbsp;</td>
      <td align="center" class=forumRow><input name="button" type=button onclick="this.value=check(this.form)" value=" 全部选定 " /></td>
      <td align="left" class=forumRow>&nbsp;</td>
    </tr>
    <tr height="20" bgcolor="#ffffff">
      <td class=forumrowHighLight align="center" colspan="6">&nbsp;</td>
    </tr>
  </table>
</form>
<%
Function GetCount(id)
	Sql="Select Count(*) from benming_ch_Cocat where root="&id
	Set Rs1=Server.Createobject("ADODB.RecordSet")
	Rs1.open Sql,Conn,1,1
	if Rs1.bof=False and Rs1.eof=False then
		GetCount=Rs1(0)
	else
		GetCount=0
	end if
End Function
%>