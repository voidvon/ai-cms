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
 	if trim(ins)="07" then 
 		ishavegant=true
 	end if
 next 
 if ishavegant=false then
	 response.redirect "../../err.asp"
 	response.end
 end if
 '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^End
if request.QueryString("action")="del" then
	if not isempty(request("selAnnounce")) then
		newsidlist=request("selAnnounce")
		if instr(newsidlist,",")>0 then
			dim newsidarr
			newsidArr=split(newsidlist)
			dim log_newsid
			for i = 0 to ubound(newsidarr)
				log_newsid=clng(newsidarr(i))
				call deleteannounce(log_newsid)
			next
		else
			call deleteannounce(clng(newsidlist))
		end if
	end if
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
</script>
<style type="text/css">
<!--
.STYLE1 {color: #FF0000}
-->
</style>
<Form name="search" method="POST" action="Msg.asp?action=del">
  <table wnewsidth="100%" border="0" align="center" cellpadding="2" cellspacing="1" class="tableBorder">
    <tr>
      <th class="tableHeaderText" height=25 colspan="6">文章列表</th>
    <tr>
      <td colspan="6">      </td>
    </tr>
    <tr height=25 class=bodytitle>
      <td width="41%" align="left" class=bodytitle wnewsidth="446"><font color="ff6600"><b>留言主题</b></font></td>
      <td width="11%" align="center" class=bodytitle wnewsidth="263"><font color="ff6600"><b>留言人</b></font></td>
      <td width="10%" align="center" class=bodytitle wnewsidth="113"><font color="ff6600"><b>留言日期</b></font></td>
      <td width="21%" align="center" class=bodytitle wnewsidth="113"><font color="ff6600"><b>状态</b></font></td>
      <td width="7%" align="center" class=bodytitle wnewsidth="62"><font color="ff6600"><b>操作</b></font></td>
      <td width="10%" align="center" class=bodytitle wnewsidth="57"><input name="submit2" type='submit' value='删除'></td>
    </tr>
    <%
	Sql="Select * from benming_ch_Msg order by date desc"
	set Rs=server.CreateObject("ADODB.Recordset")
	Rs.open Sql,conn,1,1
	msg_per_page=10
	%>
	<!--#include file="../../../inc/Headpage.asp"-->
	<%
	
	j=1
	do while not rs.eof and rowcount > 0
 
	%>
    <tr height="20">
      <td align="left" class=forumRow> &nbsp;
	<%
	Response.write Rs("Title")
	%>   	  </td>
      	<td class=forumRow align="center">
        	<%=Rs("linkren")%></td>
      	<td align="center" class=forumRow wnewsidth="113"><%=Rs("date")%></td>
      	<td align="center" class=forumRow STYLE1 wnewsidth="113">
		<%
		if Rs("state")=0 then
			response.write "<a href='chu.asp?id="&Rs("id")&"'>处理</a>"
		else
			response.write "已处理["&Rs("statedate")&"]"
		end if
		%>
		</td>
      	<td align="center" class=forumRow><a href="show.asp?id=<%=Rs("id")%>">查看</a></td>
      	<td wnewsidth="57" align="center" class=forumRow><input type='checkbox' name='selAnnounce' value='<%=Rs("id")%>'></td>
    </tr>
	 <%
		rowcount=rowcount-1
		rs.movenext
		j=j+1
	loop

	%> 
	<tr height="20" bgcolor="#ffffff">
      <td colspan="6"  class=forumRow align="right">
          <input name="button" type=button onClick="this.value=check(this.form)" value=" 全部选定 ">      </td>
    </tr>
    <tr height="20" bgcolor="#ffffff">
      <td class=forumrowHighLight align="center" colspan="6"><%=listPages("News_index.asp")%></td>
    </tr>
  </table>
</form>
  <%
  	Rs.close
	Set Rs=nothing

  
  '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^删除文章图片同生成页面
  	sub deleteannounce(id)
	
		sql="delete from [benming_ch_Msg] where id="&cstr(id)
		conn.execute sql
		if err.Number<>0 then
			err.clear
			response.write "删 除 失 败 !<br>"
		end if
	End sub
  
  Conn.close
  Set Conn=nothing
  %>