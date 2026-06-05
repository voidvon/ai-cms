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
 	if trim(ins)="02" then 
 		ishavegant=true
 	end if
 next 
 if ishavegant=false then
	 response.redirect "../../err.asp"
 	response.end
 end if
Set Rs=Server.CreateObject("ADODB.RecordSet")
Sql="Select * from benming_ch_config where id=1"
Rs.open Sql,conn,1,3
if request.QueryString("action")="save" then
	Rs("WebName")=Request.Form("WebName")
	Rs("WebUrl")=Request.Form("WebUrl")
	Rs("CoName")=Request.Form("CoName")
	Rs("CoAdd")=Request.Form("CoAdd")
	Rs("CoPost")=Request.Form("CoPost")
	Rs("CoPhone")=Request.Form("CoPhone")
	Rs("CoFax")=Request.Form("CoFax")
	Rs("CoRen")=Request.Form("CoRen")
	Rs("CoEmail")=Request.Form("CoEmail")
	Rs("WebIcp")=Request.Form("WebIcp")
	Rs("WebQQ")=Request.Form("WebQQ")
	Rs("Webmsn")=request.Form("Webmsn")
	Rs("WebCopyright")=request.Form("WebCopyright")
	Rs("Webauthor")=request.Form("Webauthor")
	Rs.update
	response.Redirect("Config.asp")
else
	If not Rs.eof then
		WebName=Rs("WebName")
		WebUrl=Rs("WebUrl")
		CoName=Rs("CoName")
		CoAdd=Rs("CoAdd")
		CoPost=Rs("CoPost")
		CoPhone=Rs("CoPhone")
		CoFax=Rs("CoFax")
		CoRen=Rs("CoRen")
		CoEmail=Rs("CoEmail")
		WebIcp=Rs("WebIcp")
		WebQQ=Rs("WebQQ")
		Webmsn=Rs("Webmsn")
		Webauthor=Rs("Webauthor")
		WebCopyright=Rs("WebCopyright")
	end if
end if
Rs.close
Set Rs=nothing
conn.close
Set conn=nothing
%>
<meta http-equiv="Content-Type" content="text/html; charset=gb2312">
<style type="text/css">
<!--
body,td,th {
	font-size: 12px;
}
-->
</style>
<LINK href="../../css/style.css" rel=stylesheet type=text/css> 
<title>网站配置</title>
<br/>
<form name="form" method="POST" action="?action=save">
<table cellpadding="2" cellspacing="1" border="0" width="95%" class="tableBorder" align=center>
  
 
	  <tr>
      <th height=23 align=left>网 站 配 置</th>
    </tr>
	<tr>
      <td><table width="100%" height="147" border="0" cellpadding="0" cellspacing="1"> 
                          <tr> 
                            <td width="15%" valign="middle" height="22" class=forumRow>  网 站 名 称：</td> 
                            <td width="34%" valign="middle" height="22" class=forumRow> <input name="WebName" type="text" class="f11" id="WebName" value="<%=WebName%>" size="40" maxlength="100">                          </td> 
                            <td width="16%" valign="middle" height="22" class=forumRow>网 站 域 名：</td> 
                            <td width="35%" valign="middle" height="22" class=forumRow> <input name="WebUrl" type="text" id="WebUrl" value="<%=WebUrl%>" size="40" maxlength="100" ></td> 
                          </tr> 
                          <tr>
                            <td valign="middle" height="19" class=forumRow>网 站 作 者：</td>
                            <td valign="middle" height="19" class=forumRow><input name="Webauthor" type="text" class="f11" id="Webauthor" value="<%=Webauthor%>" size="40" maxlength="100" /></td>
                            <td valign="middle" height="19" class=forumRow>网 站 版 权：</td>
                            <td valign="middle" height="19" class=forumRow><input name="WebCopyright" type="text" id="WebCopyright" value="<%=WebCopyright%>" size="40" maxlength="100"></td>
                          </tr>
                          <tr> 
                            <td width="15%" valign="middle" height="19" class=forumRow>公 司 名 称：</td> 
                            <td width="34%" valign="middle" height="19" class=forumRow> <input name="CoName" type="text" id="CoName" value="<%=CoName%>" size="40" maxlength="100"></td> 
                            <td width="16%" valign="middle" height="19" class=forumRow>联 系 地 址：</td> 
                            <td width="35%" valign="middle" height="19" class=forumRow> <input name="CoAdd" type="text" id="CoAdd" value="<%=CoAdd%>" size="40" maxlength="200"></td> 
                          </tr> 
                          <tr> 
                            <td width="15%" valign="middle" height="22" class=forumRow>联 系 电 话：</td> 
                            <td width="34%" valign="middle" height="22" class=forumRow> <input name="CoPhone" type="text" id="CoPhone" value="<%=CoPhone%>" size="40" maxlength="100"></td> 
                            <td width="16%" valign="middle" height="22" class=forumRow>邮 政 编 码：</td> 
                            <td width="35%" valign="middle" height="22" class=forumRow> <input name="CoPost" type="text" id="CoPost" value="<%=CoPost%>" size="40" maxlength="10"></td> 
                          </tr> 
                          <tr> 
                            <td width="15%" valign="middle" height="19" class=forumRow>传 真 号 码：</td> 
                            <td width="34%" valign="middle" height="19" class=forumRow> <input name="CoFax" type="text" id="CoFax" value="<%=CoFax%>" size="40" maxlength="100"></td> 
                            <td width="16%" valign="middle" height="19" class=forumRow>联 系 人：</td> 
                            <td width="35%" valign="middle" height="19" class=forumRow><input name="CoRen" type="text" id="CoRen" value="<%=CoRen%>" size="40" maxlength="100"> 
                            <font color="#CC3300">&nbsp; </font></td> 
                          </tr> 
                          <tr> 
                            <td width="15%" valign="middle" height="19" class=forumRow>电 子 信 箱：</td> 
                            <td width="34%" valign="middle" height="19" class=forumRow> <input name="CoEmail" type="text" id="CoEmail" value="<%=CoEmail%>" size="40" maxlength="100"></td> 
                            <td width="16%" valign="middle" height="19" class=forumRow>ICP备 案 号：</td> 
                            <td width="35%" valign="middle" height="19" class=forumRow> <input name="WebIcp" type="text" id="WebIcp" value="<%=WebIcp%>" size="40" maxlength="100" ></td> 
                          </tr>
                          <tr>
                            <td valign="middle" height="19" class=forumRow>联 系 Q Q：</td>
                            <td valign="middle" height="19" class=forumRow><input name="WebQQ" type="text" id="WebQQ" value="<%=WebQQ%>" size="40" maxlength="100" /></td>
                            <td valign="middle" height="19" class=forumRow>手机：</td>
                            <td valign="middle" height="19" class=forumRow><input name="Webmsn" type="text" id="Webmsn" value="<%=Webmsn%>" size="40" maxlength="100" /></td>
                          </tr> 
      </table></td>
	</tr>
	<tr>
      <td class="forumRow">
	  	<TABLE width="100%" border=0 cellPadding=0 cellSpacing=0>
			<TBODY>
              <TR>
                <TD height="30" align=center noWrap><input type="submit" name="Submit" value="保  存"   /></TD>
              </TR>
			 </TBODY>
		</TABLE>
	</td>
   </tr>
  </table>
</form>