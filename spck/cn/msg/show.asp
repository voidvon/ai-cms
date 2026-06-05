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
 	if trim(ins)="07" then 
 		ishavegant=true
 	end if
 next 
 if ishavegant=false then
	 response.redirect "../../err.asp"
 	response.end
 end if
 '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^End
 id=request.querystring("id")

 Sql="Select * From benming_ch_Msg where id="&id
 Set Rs=server.CreateObject("ADODB.Recordset")
 Rs.open Sql,Conn,1,1
 if Rs.eof=False and Rs.bof=False then
 	Title=Rs("Title")
	linkren=Rs("linkren")
	phone=Rs("phone")
	mobile=Rs("mobile")
	fax=Rs("fax")
	email=Rs("email")
	content=RS("content")
	date1=Rs("date")
	statedate=Rs("statedate")
	address=Rs("address")
	state1=Rs("state")
 end if
 Rs.close
 Set Rs=nothing
 Conn.close
 Set Conn=nothing
%>
<html>
<head>
<title>网站管理系统</title>
<meta http-equiv="Content-Type" content="text/html; charset=gb2312">
<LINK href="../../css/style.css" rel=stylesheet type=text/css> 
<style type="text/css">
<!--
.STYLE1 {color: #FFFFFF}
.STYLE2 {color: #FF0000}
-->
</style>
<body>

<table width="100%" height="100%" border="0" cellpadding="0" cellspacing="0">
  <tr> 
    <td align="center" valign="top">
		<table width="100%" border="0" cellpadding="0" cellspacing="1"  >
        	<tr> 
          		<th height="28" class="tableHeaderText" align="center"> 
            		<strong>留言管理 </strong></th>
        	</tr>
        	<tr> 
          	<td> 
			
				<div align="center"> 

              <table  width="100%" border="0" cellpadding="0" cellspacing="1"  >
                <tr> 
                  <td height="25" colspan="4" bgcolor="#449AE8" align="center" ><span class="STYLE1">&nbsp;查看留言</span></td>
                </tr>
                
                <tr class=tdbg>
                  <td width="13%" height="25" align="center" bgcolor="#F0F0F0" class=tdbg>联系人：</td>
                  <td width="25%" height="25" bgcolor="#F0F0F0" class=tdbg>&nbsp;<%=linkren%></td>
                  <td width="8%" bgcolor="#F0F0F0" class=tdbg>联系电话：</td>
                  <td width="54%" bgcolor="#F0F0F0" class=tdbg>&nbsp;<%=phone%></td>
                </tr>
                
                <tr class=tdbg>
                  <td height="25" align="center" bgcolor="#F0F0F0">E-Mail:</td>
                  <td height="25" bgcolor="#F0F0F0">&nbsp;<%=email%></td>
                  <td height="25" bgcolor="#F0F0F0">地址：</td>
                  <td height="25" bgcolor="#F0F0F0">&nbsp;<%=address%></td>
                </tr>
                <tr class=tdbg> 
                  <td height="25" align="center" bgcolor="#F0F0F0"> 主 题：</td>
                  <td height="25" colspan="3" bgcolor="#F0F0F0">&nbsp;&nbsp;<%=Title%>[ <%=date1%> ]</td>
                </tr>
                <tr class=tdbg> 
                  <td height="25" align="center" bgcolor="#F0F0F0"> 内 容：</td>
                  <td height="25" colspan="3" bgcolor="#F0F0F0">&nbsp;&nbsp;<%=content%></td>
                </tr>
              </table>
            </div></td>
        </tr>
      </table>
      <br>
      <table width="98%" border="0" cellpadding="0" cellspacing="0">
        <tr>
          <td>
		  <%if state1=1 then%>
		  <span class="STYLE2">[<strong> <%=statedate%> </strong>]进行了处理</span>
		  <%end if%>
		  </td>
        </tr>
      </table>      </td>
  </tr>
</table>

</body>
</html>